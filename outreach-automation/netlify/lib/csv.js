// Small dependency-free CSV parser — good enough for lead-export CSVs
// (Name, Email, Handle, URL, Niche, Score, Country columns etc).
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] || '').trim()));
    return obj;
  });
}

module.exports = { parseCSV };
