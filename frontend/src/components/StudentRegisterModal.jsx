import React, { useEffect, useRef, useState } from 'react';

export default function StudentRegisterModal({
  onClose, students, studentBalances,
  schoolInfo, settings,
  studentFilter, genderFilter, arrearsFilter, searchQuery,
  currencySymbol, convertAmount,
  exportToExcel, exportToCSV
}) {
  const closeButtonRef = useRef(null);
  const [printError, setPrintError] = useState('');
  students = students || [];
  studentBalances = studentBalances || {};
  schoolInfo = schoolInfo || {};
  settings = settings || {};
  currencySymbol = currencySymbol || 'GHC';
  convertAmount = convertAmount || function(v) { return v; };

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalMale = students.filter(s => (s.gender || 'M').toUpperCase() === 'M').length;
  const totalFemale = students.filter(s => (s.gender || 'F').toUpperCase() === 'F').length;
  const withBalance = students.filter(s => ((studentBalances[s.sid] || {}).balance || 0) > 0).length;
  const fullyPaid = students.length - withBalance;

  const getFilterLabel = () => {
    const parts = [];
    if (studentFilter) parts.push('Class: ' + studentFilter);
    if (genderFilter && genderFilter !== 'all') parts.push('Gender: ' + (genderFilter === 'M' ? 'Male' : 'Female'));
    if (arrearsFilter && arrearsFilter !== 'all') parts.push('Fees: ' + arrearsFilter);
    if (searchQuery) parts.push('Search: ' + searchQuery);
    return parts.length > 0 ? parts.join(' | ') : 'All Students';
  };

  const buildRows = () => students.map((s, i) => {
    const bal = convertAmount(((studentBalances[s.sid] || {}).balance) || 0).toFixed(2);
    const balColor = parseFloat(bal) > 0 ? '#dc2626' : '#16a34a';
    const bg = i % 2 === 0 ? '#fafafa' : '#fff';
    return '<tr style="border-bottom:1px solid #e5e7eb;background:' + bg + '">' +
      '<td style="padding:7px 8px;text-align:center;font-size:11px;">' + (i+1) + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;font-weight:600;">' + (s.sid||'-') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;">' + (s.name||'-') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;text-align:center;">' + ((s.gender||'M')==='M'?'Male':'Female') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;">' + (s.class||'-') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;">' + (s.contact||'-') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;">' + (s.residence||'-') + '</td>' +
      '<td style="padding:7px 8px;font-size:11px;text-align:right;color:' + balColor + ';font-weight:700;">' + currencySymbol + ' ' + bal + '</td>' +
      '</tr>';
  }).join('');

  const printContent = () => {
    setPrintError('');
    const logoSrc = (settings && settings.logoUrl) || (schoolInfo && schoolInfo.logoUrl) || '/logo.png';
    const logoHtml = logoSrc
      ? '<img src="' + logoSrc + '" alt="School Logo" style="height:70px;max-width:140px;object-fit:contain;" onError="this.style.display=\'none\'" />'
      : '<div style="width:65px;height:65px;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;">&#127979;</div>';

    const totalBalance = students.reduce((sum, s) => sum + convertAmount(((studentBalances[s.sid] || {}).balance) || 0), 0).toFixed(2);
    const filterLine = getFilterLabel() !== 'All Students'
      ? '<div style="font-size:11px;margin-top:4px;font-style:italic;font-weight:600;">Filter Applied: ' + getFilterLabel() + '</div>'
      : '';

    const summaryCards = [
      ['Total Students', students.length, '#000000'],
      ['Male Students', totalMale, '#1d4ed8'],
      ['Female Students', totalFemale, '#be185d'],
      ['Outstanding Fees', withBalance, '#b91c1c'],
      ['Fully Paid', fullyPaid, '#15803d']
    ].map(item => '<div style="border:1.5px solid #000;padding:8px 6px;text-align:center;border-radius:4px;background:#f9fafb;">' +
      '<div style="font-size:18px;font-weight:900;color:' + item[2] + ';">' + item[1] + '</div>' +
      '<div style="font-size:9px;font-weight:800;color:#000;text-transform:uppercase;margin-top:2px;">' + item[0] + '</div>' +
      '</div>').join('');

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8" />' +
      '<title>Student Register - ' + (schoolInfo.schoolName||'School') + '</title>' +
      '<style>' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{font-family:"Helvetica Neue",Arial,sans-serif;background:#fff;color:#000;padding:12mm 15mm;font-size:11px;line-height:1.3;}' +
      'table{width:100%;border-collapse:collapse;margin-top:10px;}' +
      'thead{display:table-header-group;}' +
      'tfoot{display:table-footer-group;}' +
      'th{background:#000;color:#fff;padding:8px 6px;font-size:11px;font-weight:800;text-align:left;border:1px solid #000;text-transform:uppercase;}' +
      'th:first-child{text-align:center;}' +
      'th:last-child{text-align:right;}' +
      'td{padding:6px;font-size:11px;border:1px solid #d1d5db;vertical-align:middle;}' +
      'tr{page-break-inside:avoid;}' +
      '@page{size:A4 portrait;margin:12mm 15mm;}' +
      '@media print{' +
        'body{padding:0;color:#000;}' +
        '.no-print{display:none !important;}' +
        'th{background:#000 !important;color:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '}' +
      '</style>' +
      '</head><body>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:12px;">' +
        '<div>' + logoHtml + '</div>' +
        '<div style="flex:1;text-align:center;padding:0 12px;">' +
          '<div style="font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;">' + (schoolInfo.schoolName||'School Name') + '</div>' +
          (schoolInfo.address ? '<div style="font-size:11px;margin-top:3px;font-weight:500;">' + schoolInfo.address + '</div>' : '') +
          '<div style="font-size:11px;margin-top:2px;font-weight:500;">' + (schoolInfo.phone ? 'Tel: '+schoolInfo.phone : '') + (schoolInfo.email ? ' &nbsp;|&nbsp; Email: '+schoolInfo.email : '') + '</div>' +
        '</div>' +
        '<div>' + logoHtml + '</div>' +
      '</div>' +
      '<div style="text-align:center;margin-bottom:14px;">' +
        '<div style="font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1.5px solid #000;display:inline-block;padding-bottom:2px;">OFFICIAL STUDENT REGISTER</div>' +
        '<div style="font-size:11px;margin-top:6px;font-weight:600;">' +
          'Academic Year: ' + (schoolInfo.academicYear||'2026/2027') + ' &nbsp;|&nbsp; ' +
          'Term: ' + (schoolInfo.term||'Term 1') + ' &nbsp;|&nbsp; ' +
          'Date Printed: ' + today + ' &nbsp;|&nbsp; ' +
          'Total Records: ' + students.length +
        '</div>' +
        filterLine +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">' + summaryCards + '</div>' +
      '<table><thead><tr>' +
        '<th style="width:32px;">#</th>' +
        '<th style="width:95px;">Student ID</th>' +
        '<th>Student Name</th>' +
        '<th style="width:60px;text-align:center;">Gender</th>' +
        '<th style="width:95px;">Class</th>' +
        '<th style="width:100px;">Contact</th>' +
        '<th>Parent / Guardian</th>' +
        '<th style="width:90px;text-align:right;">Balance (' + currencySymbol + ')</th>' +
      '</tr></thead><tbody>' + buildRows() + '</tbody>' +
      '<tfoot><tr>' +
        '<td colspan="7" style="padding:8px 6px;font-size:11px;font-weight:900;border:1.5px solid #000;text-align:right;background:#f3f4f6;">TOTAL REGISTERED STUDENTS: ' + students.length + '</td>' +
        '<td style="padding:8px 6px;font-size:11px;font-weight:900;border:1.5px solid #000;text-align:right;background:#f3f4f6;">' + currencySymbol + ' ' + totalBalance + '</td>' +
      '</tr></tfoot></table>' +
      '<div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;font-size:11px;page-break-inside:avoid;">' +
        '<div><div style="border-top:1.5px solid #000;padding-top:6px;text-align:center;font-weight:700;">Headteacher / Administrator</div></div>' +
        '<div><div style="border-top:1.5px solid #000;padding-top:6px;text-align:center;font-weight:700;">Official Stamp</div></div>' +
        '<div><div style="border-top:1.5px solid #000;padding-top:6px;text-align:center;font-weight:700;">Date & Signature</div></div>' +
      '</div></body></html>';

    let pw;
    try {
      pw = window.open('', '_blank');
    } catch {
      setPrintError('The print window could not be opened. Allow popups for this site and try again.');
      return;
    }
    if (pw) {
      pw.document.write(html);
      pw.document.close();
      pw.focus();
      setTimeout(() => {
        try { pw.print(); } catch { setPrintError('Printing could not start. Try exporting the register instead.'); }
      }, 600);
    } else {
      setPrintError('The print window was blocked. Allow popups for this site and try again.');
    }
  };


  const handleExcelExport = () => {
    const formatted = students.map((s, i) => ({
      '#': i + 1, 'Student ID': s.sid, 'Student Name': s.name,
      'Gender': (s.gender||'M') === 'M' ? 'Male' : 'Female', 'Class': s.class,
      'Contact': s.contact || 'N/A', 'Parent / Guardian': s.residence || 'N/A',
      ['Balance (' + currencySymbol + ')']: convertAmount(((studentBalances[s.sid]||{}).balance)||0).toFixed(2)
    }));
    exportToExcel(formatted, 'Student_Register_' + (studentFilter||'All') + '_' + (schoolInfo.term||''));
  };

  const handleCSVExport = () => {
    const formatted = students.map((s, i) => ({
      '#': i + 1, 'Student ID': s.sid, 'Student Name': s.name,
      'Gender': (s.gender||'M') === 'M' ? 'Male' : 'Female', 'Class': s.class,
      'Contact': s.contact || 'N/A', 'Parent / Guardian': s.residence || 'N/A',
      ['Balance (' + currencySymbol + ')']: convertAmount(((studentBalances[s.sid]||{}).balance)||0).toFixed(2)
    }));
    exportToCSV(formatted, 'Student_Register_' + (studentFilter||'All') + '_' + (schoolInfo.term||''));
  };

  const summaryStats = [
    ['Total Students', students.length, 'var(--primary)'],
    ['Male', totalMale, '#1d4ed8'],
    ['Female', totalFemale, '#9d174d'],
    ['Outstanding', withBalance, 'var(--danger)'],
    ['Fully Paid', fullyPaid, 'var(--success)'],
  ];

  return (
    <div className="modal" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="student-register-title" aria-describedby={printError ? 'student-register-error' : undefined}
        style={{ maxWidth: '920px', width: '98%', padding: '0', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 id="student-register-title" style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>&#128424; Student Register Preview</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-main)' }}>
              {students.length} student{students.length !== 1 ? 's' : ''} &middot; {getFilterLabel()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '8px 14px' }} onClick={handleExcelExport}>&#128228; Export Excel</button>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '8px 14px' }} onClick={handleCSVExport}>&#128196; Export CSV</button>
            <button className="btn btn-primary" style={{ fontSize: '12px', padding: '8px 18px' }} onClick={printContent}>&#128424; Print / Save PDF</button>
            <button ref={closeButtonRef} className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Close student register preview" title="Close register preview">&#x2715;</button>
          </div>
        </div>
        {printError && <div id="student-register-error" role="alert" style={{ padding: '10px 24px', color: 'var(--danger)', background: 'rgba(220,38,38,0.08)', fontSize: 13, fontWeight: 700 }}>{printError}</div>}

        {/* Summary Strip */}
        <div style={{ padding: '12px 24px', background: 'var(--glass-bg)', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', flexShrink: 0 }}>
          {summaryStats.map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderTop: '3px solid ' + color, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, color }}>{val}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflow: 'auto', flex: 1, padding: '0 24px 24px' }}>
          <table className="table" style={{ marginTop: '14px', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                <th style={{ width: '100px' }}>Student ID</th>
                <th>Student Name</th>
                <th style={{ width: '64px', textAlign: 'center' }}>Gender</th>
                <th style={{ width: '100px' }}>Class</th>
                <th style={{ width: '100px' }}>Contact</th>
                <th>Parent / Guardian</th>
                <th style={{ textAlign: 'right', width: '90px' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const bal = convertAmount(((studentBalances[s.sid] || {}).balance) || 0);
                return (
                  <tr key={s.id || s.sid || i}>
                    <td style={{ textAlign: 'center', color: 'var(--text-main)', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700 }}>{s.sid}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ textAlign: 'center' }}>{(s.gender||'M') === 'M' ? 'M' : 'F'}</td>
                    <td>{s.class}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-main)' }}>{s.contact || '-'}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-main)' }}>{s.residence || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: bal > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {currencySymbol} {bal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-color)', background: 'var(--glass-bg)' }}>
                <td colSpan={7} style={{ padding: '10px 8px', fontWeight: 800, textAlign: 'right', fontSize: '12px' }}>
                  TOTAL STUDENTS: {students.length}
                </td>
                <td style={{ padding: '10px 8px', fontWeight: 800, textAlign: 'right', fontSize: '12px', color: 'var(--danger)' }}>
                  {currencySymbol} {students.reduce((sum, s) => sum + convertAmount(((studentBalances[s.sid]||{}).balance)||0), 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
