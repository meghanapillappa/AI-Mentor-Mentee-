"""
Matching engine service.

Owns the mentor <-> mentee assignment algorithm and all incremental
rebalancing logic (adding/removing a mentor after a match has already run).
No Flask-specific code lives here, so it can be tested or reused standalone.

If your feature is about *how* students get matched to mentors (the
algorithm itself, its fairness rules, or what happens when the mentor list
changes), this is the file you want.
"""

import numpy as np


def assign_grade(cgpa):
    """Categorizes students into letter grades based on CGPA thresholds."""
    if cgpa >= 9:
        return 'A'
    elif cgpa >= 8:
        return 'B'
    elif cgpa >= 7:
        return 'C'
    else:
        return 'D'


def balance_matching(students_df, mentors_list,excluded_mentors=None):
    """
    Matches students to mentors ensuring:
    1. Even representation from each Grade and Section combination.
    2. Evenly balanced overall average GPA across all mentors.
    """
    students_df['Grade'] = students_df['CGPA'].apply(assign_grade)
    excluded_set = set(excluded_mentors or [])
    eligible_mentors = [m for m in mentors_list if m not in excluded_set]

    mentor_assignments = {m: [] for m in mentors_list}
    mentor_strata_counts = {m: {} for m in mentors_list}

    strata_groups = students_df.groupby(['Grade', 'Section'])

    if eligible_mentors:
        for (grade, section), group in strata_groups:
            sorted_group = group.sort_values(by='CGPA', ascending=False).to_dict('records')

            for student in sorted_group:
                def mentor_suitability(m):
                    stratum_count = mentor_strata_counts[m].get((grade, section), 0)
                    total_count = len(mentor_assignments[m])
                    gpa_sum = sum(s['CGPA'] for s in mentor_assignments[m])
                    avg_gpa = (gpa_sum / total_count) if total_count > 0 else 0.0
                    return (stratum_count, total_count, avg_gpa)

                chosen_mentor = min(eligible_mentors, key=mentor_suitability)

                mentor_assignments[chosen_mentor].append(student)
                mentor_strata_counts[chosen_mentor][(grade, section)] = \
                    mentor_strata_counts[chosen_mentor].get((grade, section), 0) + 1

        return format_cohort_results(mentor_assignments)


def format_cohort_results(mentor_assignments):
    """Turns a {mentor: [student, ...]} dict into the standard API response shape."""
    results = []
    for mentor, assigned_students in mentor_assignments.items():
        avg_gpa = np.mean([s['CGPA'] for s in assigned_students]) if assigned_students else 0.0
        results.append({
            "mentor": mentor,
            "average_gpa": round(float(avg_gpa), 3),
            "student_count": len(assigned_students),
            "students": sorted(assigned_students, key=lambda x: (x['Grade'], x['Section'], -x['CGPA']))
        })
    return results


def cohorts_to_assignments(cohorts):
    """Converts the API cohort response shape back into a {mentor: [student, ...]} dict."""
    return {c['mentor']: list(c['students']) for c in cohorts}


def build_strata_counts(mentor_assignments):
    counts = {m: {} for m in mentor_assignments}
    for m, students in mentor_assignments.items():
        for s in students:
            key = (s['Grade'], s['Section'])
            counts[m][key] = counts[m].get(key, 0) + 1
    return counts


def add_mentor_rebalance(cohorts, new_mentor):
    """
    Adds a new mentor to an existing assignment, preserving most of the
    previous mapping. Pulls a small, stratum-balanced slice of students from
    each existing mentor (preferring whoever currently holds the most of a
    given Grade/Section stratum) so the new mentor ends up with a fair share.
    """
    mentor_assignments = cohorts_to_assignments(cohorts)

    if new_mentor in mentor_assignments:
        raise ValueError(f"Mentor '{new_mentor}' already exists in the current mapping.")

    existing_mentors = list(mentor_assignments.keys())
    mentor_assignments[new_mentor] = []
    total_mentor_count = len(existing_mentors) + 1
    total_students = sum(len(v) for v in mentor_assignments.values())
    target_for_new = round(total_students / total_mentor_count) if total_mentor_count else 0

    # Group currently-assigned students by (Grade, Section) stratum, keeping
    # track of which mentor currently holds each one.
    strata = {}
    for m in existing_mentors:
        for s in mentor_assignments[m]:
            key = (s['Grade'], s['Section'])
            strata.setdefault(key, {}).setdefault(m, []).append(s)
    strata_keys = list(strata.keys())

    # Tracks how many students have been pulled from each mentor so far in
    # this operation, so bucket-size ties are broken round-robin instead of
    # always favoring the same mentor. Also keeps the actual student records
    # pulled from each donor, so the caller can report (and audit-log)
    # exactly who moved from where to the new mentor.
    moved_total = {m: 0 for m in existing_mentors}
    moved_students_by_donor = {m: [] for m in existing_mentors}
    moved = 0

    # Sweep through every stratum in round-robin order, each pass taking at
    # most one student per stratum, so the new mentor ends up with a
    # representative spread instead of concentrating in whichever stratum
    # happened to be largest.
    while moved < target_for_new:
        progressed = False
        for key in strata_keys:
            if moved >= target_for_new:
                break
            holders = strata[key]
            donors = [m for m, items in holders.items() if items]
            if not donors:
                continue
            # Take from whoever currently holds the most of this stratum;
            # break ties by preferring whoever has lost the fewest students
            # so far, so the pull is spread evenly across existing mentors.
            donor = max(donors, key=lambda m: (len(holders[m]), -moved_total[m]))
            student_to_move = holders[donor].pop()
            mentor_assignments[donor].remove(student_to_move)
            mentor_assignments[new_mentor].append(student_to_move)
            moved_total[donor] += 1
            moved_students_by_donor[donor].append(student_to_move)
            moved += 1
            progressed = True
        if not progressed:
            break

    sources_summary = [
        {
            "mentor": donor,
            "students_given": len(students_given),
            "students": [
                {"name": s.get("name"), "Section": s.get("Section"), "Grade": s.get("Grade"), "CGPA": s.get("CGPA")}
                for s in students_given
            ],
        }
        for donor, students_given in moved_students_by_donor.items()
        if students_given
    ]
    # Biggest contributors first, so the summary reads "who gave up the most" first
    sources_summary.sort(key=lambda r: r["students_given"], reverse=True)

    return {
        "cohorts": format_cohort_results(mentor_assignments),
        "new_mentor": new_mentor,
        "students_pulled": moved,
        "sources": sources_summary,
    }


def remove_mentor_rebalance(cohorts, removed_mentor,excluded_mentors=None):
    """
    Removes a mentor and redistributes ONLY that mentor's students among the
    remaining mentors. Every other mentor's existing mapping is left untouched.
    """
    mentor_assignments = cohorts_to_assignments(cohorts)
    excluded_set = set(excluded_mentors or [])

    if removed_mentor not in mentor_assignments:
        raise ValueError(f"Mentor '{removed_mentor}' was not found in the current mapping.")

    orphaned_students = mentor_assignments.pop(removed_mentor)
    remaining_mentors = list(mentor_assignments.keys())
    eligible_mentors = [m for m in remaining_mentors if m not in excluded_set]

    if not remaining_mentors:
        raise ValueError("Cannot remove the only remaining mentor.")
    if not eligible_mentors:
        raise ValueError("All remaining mentors are excluded; no one is eligible to receive these mentees.")

    mentor_strata_counts = build_strata_counts(mentor_assignments)

    grouped = {}
    for s in orphaned_students:
        key = (s['Grade'], s['Section'])
        grouped.setdefault(key, []).append(s)

    # Tracks exactly which of the removed mentor's students landed with
    # which remaining mentor, so the caller can display/audit-log a
    # redistribution summary (who was removed, where their students went).
    redistribution_map = {m: [] for m in remaining_mentors}

    for key, group in grouped.items():
        sorted_group = sorted(group, key=lambda s: s['CGPA'], reverse=True)
        for student in sorted_group:
            def mentor_suitability(m):
                stratum_count = mentor_strata_counts[m].get(key, 0)
                total_count = len(mentor_assignments[m])
                gpa_sum = sum(x['CGPA'] for x in mentor_assignments[m])
                avg_gpa = (gpa_sum / total_count) if total_count > 0 else 0.0
                return (stratum_count, total_count, avg_gpa)

            chosen_mentor = min(eligible_mentors, key=mentor_suitability)
            mentor_assignments[chosen_mentor].append(student)
            mentor_strata_counts[chosen_mentor][key] = mentor_strata_counts[chosen_mentor].get(key, 0) + 1
            redistribution_map[chosen_mentor].append(student)

    redistribution_summary = [
        {
            "mentor": m,
            "students_received": len(students_received),
            "students": [
                {"name": s.get("name"), "Section": s.get("Section"), "Grade": s.get("Grade"), "CGPA": s.get("CGPA")}
                for s in students_received
            ],
        }
        for m, students_received in redistribution_map.items()
        if students_received
    ]
    # Largest recipients first, so the summary reads "who absorbed the most" first
    redistribution_summary.sort(key=lambda r: r["students_received"], reverse=True)

    return {
        "cohorts": format_cohort_results(mentor_assignments),
        "removed_mentor": removed_mentor,
        "students_reassigned": len(orphaned_students),
        "redistribution": redistribution_summary,
    }
