// ---------------------------------------------------------------------------
// mentorReallocationPicker.js
//
// Feature: when a mentor is removed, don't auto-split their mentees across
// every remaining mentor. Instead, show a modal listing the orphaned
// mentees and every other mentor, and let the user pick ONE mentor to take
// all of them.
//
// Public entry point: promptMentorChoice(removedMentorName, candidateMentors,
// orphanedStudents) -> Promise<string|null>
//   - resolves with the chosen mentor's name once the user clicks one
//   - resolves with null if the user cancels/dismisses, or if there are no
//     candidate mentors to choose from
//
// Self-contained: builds and tears down its own DOM (inline styles, no
// stylesheet dependency), so it can be dropped in without any HTML/CSS
// changes elsewhere. Include this <script> before matching.js, since
// matching.js's syncMentorChanges() calls promptMentorChoice() directly.
// ---------------------------------------------------------------------------

function promptMentorChoice(removedMentorName, candidateMentors, orphanedStudents) {
  return new Promise(resolve => {
    if (!candidateMentors.length) {
      alert(
        `Mentor "${removedMentorName}" was removed, but there are no other ` +
        `mentors available to take ${orphanedStudents.length} mentee(s).`
      );
      resolve(null);
      return;
    }

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; ' +
      'align-items:center; justify-content:center; z-index:1000;';

    const modal = document.createElement('div');
    modal.style.cssText =
      'background:#fff; border-radius:10px; padding:20px 24px; width:420px; ' +
      'max-width:90vw; max-height:80vh; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.2); ' +
      'font-family:inherit;';

    const studentNames = orphanedStudents
      .map(s => `${s.name} (${s.CGPA.toFixed(2)})`)
      .join(', ');

    modal.innerHTML = `
      <h3 style="margin:0 0 8px; font-size:16px;">Reassign mentees from "${removedMentorName}"</h3>
      <p style="margin:0 0 4px; font-size:13px; color:#555;">
        ${orphanedStudents.length} mentee(s) need a new mentor: ${studentNames}
      </p>
      <p style="margin:12px 0 8px; font-size:13px; color:#555;">
        Choose one mentor to take <strong>all</strong> of them:
      </p>
      <div id="mentor-picker-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px;"></div>
      <div style="display:flex; justify-content:flex-end;">
        <button id="mentor-picker-cancel" style="padding:6px 14px; border:1px solid #ccc; border-radius:6px; background:#fff; cursor:pointer;">Cancel</button>
      </div>
    `;

    const listEl = modal.querySelector('#mentor-picker-list');
    candidateMentors.forEach(name => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.style.cssText =
        'text-align:left; padding:10px 12px; border:1px solid #ddd; border-radius:6px; ' +
        'background:#fafafa; cursor:pointer; font-size:14px;';
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f0f0'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#fafafa'; });
      btn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(name);
      });
      listEl.appendChild(btn);
    });

    modal.querySelector('#mentor-picker-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}
