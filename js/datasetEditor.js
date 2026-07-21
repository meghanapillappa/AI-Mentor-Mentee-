// ---------------------------------------------------------------------------
// datasetEditor.js
//
// Feature: upload a mentors/mentees file, view+edit it as an in-browser
// table, add/remove rows, and save the (possibly edited) data back out as
// csv/txt/xlsx/sql. Also owns turning the raw uploaded rows into the
// normalized {name, CGPA, Section, uid} / mentor-name lists the matching
// algorithm expects.
//
// Depends on: state.js, utils.js, api.js.
// Calls queueMentorSync() (queue defined in state.js, wraps syncMentorChanges()
// from matching.js) when the mentors table changes — that's the one
// cross-module call in this file.
// ---------------------------------------------------------------------------

mentorsFileInput.addEventListener('change', async (e) => {

    if (!e.target.files.length) return;

    const file = e.target.files[0];

    try {

        const data = await apiParseFile(
            file,
            document.getElementById('mentors-status')
        );

        mentorsData = assignUids(data.mentors);

        setStatus(
            document.getElementById('mentors-status'),
            `Loaded ${mentorsData.length} mentors`,
            'ok'
        );

        renderDatasetEditor(
            mentorsEditorContainer,
            'mentors',
            mentorsData,
            () => mentorsData,
            d => mentorsData = d
        );

        verifyMatchReady();

    } catch(err){

        setStatus(
            document.getElementById('mentors-status'),
            err.message,
            'err'
        );

    }

});

studentsFileInput.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;

  const file = e.target.files[0];

  try {
    const data = await apiParseFile(file);

    studentsData = assignUids(data.mentees);

    setStatus(
      document.getElementById('students-status'),
      `Loaded ${studentsData.length} student rows from ${file.name}`,
      'ok'
    );

    renderDatasetEditor(
      studentsEditorContainer,
      'students',
      studentsData,
      () => studentsData,
      (d) => { studentsData = d; }
    );

    verifyMatchReady();

  } catch (err) {
    setStatus(
      document.getElementById('students-status'),
      `Error: ${err.message}`,
      'err'
    );
  }
});

combinedFileInput.addEventListener('change', async (e) => {

    if (!e.target.files.length) return;

    const file = e.target.files[0];

    try {

        const data = await apiParseFile(file, combinedStatus);

        if (data.mentors.length) {

            mentorsData = assignUids(data.mentors);

            renderDatasetEditor(
                mentorsEditorContainer,
                'mentors',
                mentorsData,
                () => mentorsData,
                d => mentorsData = d
            );

            setStatus(
                document.getElementById('mentors-status'),
                `Loaded ${mentorsData.length} mentors`,
                'ok'
            );
        }

        if (data.mentees.length) {

            studentsData = assignUids(data.mentees);

            renderDatasetEditor(
                studentsEditorContainer,
                'students',
                studentsData,
                () => studentsData,
                d => studentsData = d
            );

            setStatus(
                document.getElementById('students-status'),
                `Loaded ${studentsData.length} mentees`,
                'ok'
            );
        }

        setStatus(
            combinedStatus,
            "Combined dataset loaded successfully.",
            "ok"
        );

        verifyMatchReady();

    }
    catch(err){

        setStatus(
            combinedStatus,
            err.message,
            "err"
        );

    }

});


function renderDatasetEditor(container, key, data, getData, setData) {
  if (!data.length) {
    container.innerHTML = '';
    return;
  }

  // Union of all keys across rows, in first-seen order (internal _uid hidden)
  const columns = [];
  data.forEach(row => Object.keys(row).forEach(k => { if (!k.startsWith('_') && !columns.includes(k)) columns.push(k); }));

  const wrapperId = `${key}-editable-wrapper`;
  const formatSelectId = `${key}-save-format`;
  const liveNote = key === 'mentors'
    ? `<small style="display:block;margin-top:8px;">Once a match has run, adding or removing a mentor here automatically rebalances just that mentor's slice — everyone else's mapping stays put.</small>`
    : '';

  container.innerHTML = `
    <div class="dataset-editor">
      <div class="dataset-editor-header">
        <h3>${key === 'mentors' ? 'Mentors' : 'Mentees'} data (editable)</h3>
        <span>${data.length} rows &middot; ${columns.length} columns</span>
      </div>
      <div class="editable-table-wrapper" id="${wrapperId}"></div>
      <div class="dataset-editor-footer">
        <button class="ghost-btn" id="${key}-add-row-btn">+ Add row</button>
        <div class="save-row">
          <select id="${formatSelectId}">
            <option value="csv">Save as .csv</option>
            <option value="txt">Save as .txt</option>
            <option value="xlsx">Save as .xlsx</option>
            <option value="sql">Save as .sql</option>
          </select>
          <button class="ghost-btn" id="${key}-save-btn">Save edited file</button>
        </div>
      </div>
      ${liveNote}
    </div>
  `;

  const tableWrapper = document.getElementById(wrapperId);

  function renderTable() {
    const currentData = getData();
    let html = '<table class="editable-table"><thead><tr>';
    columns.forEach(col => { html += `<th>${col}</th>`; });
    html += '<th></th></tr></thead><tbody>';

    currentData.forEach((row, rIdx) => {
      html += '<tr>';
      columns.forEach(col => {
        const val = row[col] === undefined || row[col] === null ? '' : row[col];
        html += `<td><input type="text" data-row="${rIdx}" data-col="${col}" value="${String(val).replace(/"/g, '&quot;')}"></td>`;
      });
      html += `<td class="row-remove"><button data-remove-row="${rIdx}" title="Remove row">✕</button></td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    tableWrapper.innerHTML = html;

    tableWrapper.querySelectorAll('input[data-row]').forEach(input => {
      input.addEventListener('change', (e) => {
        const rIdx = parseInt(e.target.dataset.row, 10);
        const col = e.target.dataset.col;
        const d = getData();
        d[rIdx][col] = e.target.value;
        setData(d);
        if (key === 'mentors') queueMentorSync();
      });
    });

    tableWrapper.querySelectorAll('button[data-remove-row]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rIdx = parseInt(e.target.dataset.removeRow, 10);
        const d = getData();
        d.splice(rIdx, 1);
        setData(d);
        renderTable();
        verifyMatchReady();
        if (key === 'mentors') queueMentorSync();
      });
    });
  }

  renderTable();

  document.getElementById(`${key}-add-row-btn`).addEventListener('click', () => {
    const d = getData();
    const blankRow = {};
    columns.forEach(col => { blankRow[col] = ''; });
    blankRow._uid = 'u' + (uidCounter++);
    d.push(blankRow);
    setData(d);
    renderTable();
  });

  document.getElementById(`${key}-save-btn`).addEventListener('click', async () => {
    const format = document.getElementById(formatSelectId).value;
    await saveDataset(stripInternalFields(getData()), format, key);
  });
}

async function saveDataset(rows, format, filenameBase) {
  try {
    const response = await apiSaveFile(rows, format, filenameBase);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Extracting normalized lists for the matching algorithm
// ---------------------------------------------------------------------------

function extractMentorsList() {
  return mentorsData
    .map(row => getMentorName(row) ?? Object.values(row).find(v => v !== undefined && v !== null && v !== ''))
    .filter(Boolean);
}

function extractStudentsList() {
  return studentsData
    .map(row => {
      const name = getField(row, ['Name', 'name']);
      const cgpaRaw = getField(row, ['CGPA', 'cgpa', 'GPA', 'gpa']);
      const section = getField(row, ['Section', 'section']);
      return {
        name,
        CGPA: parseFloat(cgpaRaw),
        Section: (section || '').toString().trim().toUpperCase(),
        // Stable per-row id, carried through the backend untouched. Used to
        // track exactly which mentor a given student lands with after a
        // mentor is removed/added (see the reallocation report feature).
        uid: row._uid
      };
    })
    .filter(s => s.name && !isNaN(s.CGPA));
}
