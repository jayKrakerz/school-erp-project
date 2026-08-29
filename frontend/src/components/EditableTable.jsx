import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Plus, Minus, Palette, Type, Bold, Italic, Underline } from 'lucide-react';

const COLORS = [
  '#ffffff', '#000000', '#f8fafc', '#e2e8f0', '#94a3b8', '#64748b', '#334155', '#1e293b',
  '#fee2e2', '#fecaca', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
  '#ffedd5', '#fed7aa', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
  '#fef9c3', '#fef08a', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12',
  '#f0fdf4', '#dcfce7', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d',
  '#eff6ff', '#dbeafe', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
  '#f5f3ff', '#ede9fe', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
  '#fdf2f8', '#fce7f3', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843',
];

const FONT_SIZES = ['9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px'];

const EMPTY_CELL = () => ({ 
  text: '', 
  bg: '', 
  color: '', 
  fontSize: '12px', 
  fontWeight: '700', 
  fontStyle: 'normal', 
  textDecoration: 'none' 
});

export function initTableData(headers, rows) {
  const mapCell = (c) => {
    const base = typeof c === 'string' ? { text: c } : c;
    return { ...EMPTY_CELL(), ...base };
  };

  return {
    headers: headers.map(h => typeof h === 'string' ? { ...EMPTY_CELL(), text: h, fontWeight: '900', fontSize: '11px' } : { ...EMPTY_CELL(), ...h }),
    rows: rows.map(r => ({
      cells: r.cells.map(mapCell),
      isFooter: r.isFooter || false,
    })),
  };
}

export default function EditableTable({
  tableData,
  onTableChange,
  borderColor = '#000000',
  themeColor = '#b0008e',
  computedCols = [],
  computeCell,
  renderCell,
  readOnly = false,
  thStyle = {},
  tdStyle = {},
  getCellError,
  onUndo,
  canUndo = false
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [selection, setSelection] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [opCount, setOpCount] = useState(1);
  const tableRef = useRef(null);

  const border = `1.5px solid ${borderColor}`;

  useEffect(() => {
    const hide = () => setContextMenu(null);
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, []);

  const setHeader = (ci, key, val) => {
    onTableChange({
      ...tableData,
      headers: tableData.headers.map((h, i) => i === ci ? { ...h, [key]: val } : h),
    });
  };

  const setCell = (ri, ci, key, val) => {
    onTableChange({
      ...tableData,
      rows: tableData.rows.map((r, i) =>
        i === ri ? { ...r, cells: r.cells.map((c, j) => j === ci ? { ...c, [key]: val } : c) } : r
      ),
    });
  };

  const applyStyleToSelection = (key, val) => {
    if (!selection) return;
    const { start, end } = selection;
    const minRi = Math.min(start.ri, end.ri);
    const maxRi = Math.max(start.ri, end.ri);
    const minCi = Math.min(start.ci, end.ci);
    const maxCi = Math.max(start.ci, end.ci);

    const newHeaders = tableData.headers.map((h, ci) => {
      if (minRi === -1 && ci >= minCi && ci <= maxCi) return { ...h, [key]: val };
      return h;
    });

    const newRows = tableData.rows.map((r, ri) => {
      if (ri >= minRi && ri <= maxRi) {
        return {
          ...r,
          cells: r.cells.map((c, ci) => {
            if (ci >= minCi && ci <= maxCi) return { ...c, [key]: val };
            return c;
          })
        };
      }
      return r;
    });

    onTableChange({ ...tableData, headers: newHeaders, rows: newRows });
  };

  const toggleStyle = (key, val, defaultVal) => {
    if (!selection) return;
    const { ri, ci } = selection.start;
    const current = ri === -1 ? tableData.headers[ci][key] : tableData.rows[ri].cells[ci][key];
    applyStyleToSelection(key, current === val ? defaultVal : val);
  };

  const handleContextMenu = (e, ri, ci) => {
    e.preventDefault();
    if (readOnly) return;
    if (!selection || ri < Math.min(selection.start.ri, selection.end.ri) || ri > Math.max(selection.start.ri, selection.end.ri)) {
       setSelection({ start: {ri, ci}, end: {ri, ci} });
    }
    setContextMenu({ x: e.pageX, y: e.pageY, ri, ci });
  };

  const onMouseDown = (ri, ci) => {
    if (readOnly) return;
    setIsDragging(true);
    setSelection({ start: { ri, ci }, end: { ri, ci } });
  };

  const onMouseEnter = (ri, ci) => {
    if (isDragging) setSelection(prev => ({ ...prev, end: { ri, ci } }));
  };

  const onMouseUp = () => setIsDragging(false);

  const openSelectionMenu = () => {
    if (!selection) return;
    const { ri, ci } = selection.start;
    const rect = tableRef.current?.getBoundingClientRect();
    setContextMenu({
      x: Math.max(8, Math.min(window.innerWidth - 288, (rect?.left || 8) + 16)),
      y: Math.max(8, Math.min(window.innerHeight - 420, (rect?.top || 8) + 48)),
      ri,
      ci
    });
  };

  const isSelected = (ri, ci) => {
    if (!selection) return false;
    const { start, end } = selection;
    return (
      ri >= Math.min(start.ri, end.ri) &&
      ri <= Math.max(start.ri, end.ri) &&
      ci >= Math.min(start.ci, end.ci) &&
      ci <= Math.max(start.ci, end.ci)
    );
  };

  const insertRow = (index, count = 1) => {
    const cols = tableData.headers.length;
    const added = Array(count).fill(null).map(() => ({ cells: Array(cols).fill(null).map(EMPTY_CELL) }));
    const newRows = [...tableData.rows];
    newRows.splice(index, 0, ...added);
    onTableChange({ ...tableData, rows: newRows });
    setContextMenu(null);
  };

  const deleteRow = (ri) => {
    onTableChange({ ...tableData, rows: tableData.rows.filter((_, i) => i !== ri) });
    setContextMenu(null);
  };

  const insertCol = (index, count = 1) => {
    const addedHeaders = Array(count).fill(null).map(() => ({ ...EMPTY_CELL(), text: 'New Col', fontWeight: '900', fontSize: '11px' }));
    const newHeaders = [...tableData.headers];
    newHeaders.splice(index, 0, ...addedHeaders);
    const newRows = tableData.rows.map(r => {
      const newCells = [...r.cells];
      newCells.splice(index, 0, ...Array(count).fill(null).map(EMPTY_CELL));
      return { ...r, cells: newCells };
    });
    onTableChange({ ...tableData, headers: newHeaders, rows: newRows });
    setContextMenu(null);
  };

  const deleteCol = (ci) => {
    if (tableData.headers.length <= 1) return;
    onTableChange({
      ...tableData,
      headers: tableData.headers.filter((_, i) => i !== ci),
      rows: tableData.rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })),
    });
    setContextMenu(null);
  };

  const getCellValue = (row, ci, ri) => {
    if (computedCols.includes(ci) && computeCell) return computeCell(row, ci, tableData.rows, ri);
    return row.cells[ci]?.text ?? '';
  };

  const getCellStyle = (cell, isHeader = false) => ({
    background: cell.bg || (isHeader ? '#fff' : 'transparent'),
    color: cell.color || '#000',
    fontSize: cell.fontSize || (isHeader ? '11px' : '12px'),
    fontWeight: cell.fontWeight || (isHeader ? '900' : '700'),
    fontStyle: cell.fontStyle || 'normal',
    textDecoration: cell.textDecoration || 'none',
  });

  const resolveStyle = (styleObj, ...args) => typeof styleObj === 'function' ? styleObj(...args) : styleObj;

  return (
    <div className="editable-table-wrapper" onMouseUp={onMouseUp} onTouchEnd={onMouseUp} style={{ position: 'relative', userSelect: isDragging ? 'none' : 'auto' }}>
      {!readOnly && (
        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
          <button 
            onClick={() => {
              const footerIndex = tableData.rows.findIndex(r => r.isFooter);
              const targetIndex = footerIndex === -1 ? tableData.rows.length : footerIndex;
              insertRow(targetIndex);
            }} 
            className="table-tool-btn" style={toolBtn('#16a34a')}
          >
            <Plus size={14} /> Row
          </button>
          <button onClick={() => insertCol(tableData.headers.length)} className="table-tool-btn" style={toolBtn('#2563eb')}><Plus size={14} /> Col</button>
          {canUndo && <button onClick={onUndo} className="table-tool-btn" style={toolBtn('#6b7280')}><RotateCcw size={14} /> Undo</button>}
          {selection && (
            <>
              <button type="button" onClick={openSelectionMenu} className="table-tool-btn" style={toolBtn('#475569')}>Cell options</button>
              <span style={{ fontSize: '10px', color: '#666' }}>Drag to select, then use Cell options.</span>
            </>
          )}
        </div>
      )}

      <table ref={tableRef} style={{ width: '100%', borderCollapse: 'collapse', border }}>
        <thead>
          <tr>
            {tableData.headers.map((h, ci) => (
              <th key={ci} 
                onMouseDown={() => onMouseDown(-1, ci)}
                onTouchStart={() => onMouseDown(-1, ci)}
                onMouseEnter={() => onMouseEnter(-1, ci)}
                onContextMenu={(e) => handleContextMenu(e, -1, ci)}
                style={{ 
                  border, padding: '4px 6px', textAlign: 'center', 
                  ...getCellStyle(h, true),
                  ...resolveStyle(thStyle, ci),
                  outline: isSelected(-1, ci) ? '2px solid #3b82f6' : 'none',
                  zIndex: isSelected(-1, ci) ? 10 : 1,
                  wordBreak: 'break-word',
                  lineHeight: '1.1'
                }}
              >
                {!readOnly ? (
                  <textarea
                    rows={3}
                    value={h.text}
                    onChange={e => setHeader(ci, 'text', e.target.value)}
                    style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', textAlign: 'center', width: '100%', outline: 'none', resize: 'none', overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  />
                ) : h.text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, ri) => (
            <tr key={ri}>
              {tableData.headers.map((_, ci) => {
                const isComputed = computedCols.includes(ci);
                const val = getCellValue(row, ci, ri);
                const cell = row.cells[ci] || EMPTY_CELL();
                const cellStyle = getCellStyle(cell);
                const cellError = getCellError?.(row, ci, ri, val);
                return (
                  <td key={ci} 
                    onMouseDown={() => onMouseDown(ri, ci)}
                    onTouchStart={() => onMouseDown(ri, ci)}
                    onMouseEnter={() => onMouseEnter(ri, ci)}
                    onContextMenu={(e) => handleContextMenu(e, ri, ci)}
                    style={{ 
                      border, padding: '5px 8px', textAlign: 'center', 
                      ...resolveStyle(tdStyle, ci, ri, row),
                      ...cellStyle,
                      outline: cellError ? '2px solid #dc2626' : (isSelected(ri, ci) ? '1px solid #3b82f6' : 'none'),
                      backgroundColor: cellError ? '#fef2f2' : (isSelected(ri, ci) ? '#dbeafe' : cellStyle.background)
                    }}
                    title={cellError || undefined}
                  >
                    {(() => {
                      const rendered = renderCell ? renderCell(val, ri, ci, row) : undefined;
                      if (rendered !== undefined) return rendered;
                      return (readOnly || isComputed ? <span style={{ whiteSpace: 'pre-wrap' }}>{val}</span> : (
                        <>
                          <textarea
                            value={cell.text}
                            onChange={e => setCell(ri, ci, 'text', e.target.value)}
                            rows={cell.text ? cell.text.split('\n').length : 1}
                            aria-invalid={cellError ? 'true' : undefined}
                            style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', textAlign: 'inherit', width: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', overflow: 'hidden', padding: 0, display: 'block' }}
                          />
                          {cellError && <span className="no-print" style={{ display: 'block', color: '#b91c1c', fontSize: '9px', lineHeight: 1.2, marginTop: '2px' }}>{cellError}</span>}
                        </>
                      ));
                    })()}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {contextMenu && (
        <div 
          className="no-print"
          style={{ 
            position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: 'white', border: '1px solid #ccc', borderRadius: '12px', 
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', zIndex: 9999, padding: '16px', width: '280px'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={menuHeader()}><Palette size={12} /> BACKGROUND COLOR</div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '5px' }}>
                <div style={{ position: 'relative', width: '60px', height: '35px', borderRadius: '6px', border: '1px solid #ddd', overflow: 'hidden', background: selection ? (contextMenu.ri === -1 ? tableData.headers[contextMenu.ci].bg : tableData.rows[contextMenu.ri].cells[contextMenu.ci].bg) || '#fff' : '#fff' }}>
                  <input type="color" onChange={e => applyStyleToSelection('bg', e.target.value)} style={{ position: 'absolute', top: -10, left: -10, width: '150%', height: '150%', cursor: 'pointer', border: 'none' }} />
                </div>
                <button onClick={() => applyStyleToSelection('bg', themeColor)} style={themeBtn(themeColor)}>USE THEME COLOR</button>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={menuHeader()}><Plus size={12} /> QUANTITY:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '15px' }}>
                  <button onClick={() => setOpCount(Math.max(1, opCount - 1))} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><Minus size={10} /></button>
                  <span style={{ fontSize: '11px', fontWeight: 900, minWidth: '15px', textAlign: 'center' }}>{opCount}</span>
                  <button onClick={() => setOpCount(opCount + 1)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><Plus size={10} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '5px' }}>
                {contextMenu.ri !== -1 ? (
                  <>
                    <button onClick={() => insertRow(contextMenu.ri, opCount)} style={actionBtn()}><Plus size={12} /> {opCount} Above</button>
                    <button onClick={() => insertRow(contextMenu.ri + 1, opCount)} style={actionBtn()}><Plus size={12} /> {opCount} Below</button>
                    <button onClick={() => deleteRow(contextMenu.ri)} style={deleteBtn()}><Minus size={12} /> Delete Row</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => insertCol(contextMenu.ci, opCount)} style={actionBtn()}><Plus size={12} /> {opCount} Left</button>
                    <button onClick={() => insertCol(contextMenu.ci + 1, opCount)} style={actionBtn()}><Plus size={12} /> {opCount} Right</button>
                    <button onClick={() => deleteCol(contextMenu.ci)} style={deleteBtn()}><Minus size={12} /> Delete Col</button>
                  </>
                )}
              </div>
            </div>

            <div>
              <div style={menuHeader()}><Type size={12} /> TEXT STYLING</div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                <button onClick={() => toggleStyle('fontWeight', '900', '700')} style={styleBtn()}><Bold size={14} /></button>
                <button onClick={() => toggleStyle('fontStyle', 'italic', 'normal')} style={styleBtn()}><Italic size={14} /></button>
                <button onClick={() => toggleStyle('textDecoration', 'underline', 'none')} style={styleBtn()}><Underline size={14} /></button>
                <select 
                  style={{ flex: 1.5, fontSize: '11px', padding: '2px', border: '1px solid #ddd', borderRadius: '3px' }}
                  onChange={(e) => applyStyleToSelection('fontSize', e.target.value)}
                  value={selection ? (contextMenu.ri === -1 ? tableData.headers[contextMenu.ci].fontSize : tableData.rows[contextMenu.ri].cells[contextMenu.ci].fontSize) : '12px'}
                >
                  {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ position: 'relative', width: '40px', height: '25px', borderRadius: '4px', border: '1px solid #ddd', overflow: 'hidden', background: selection ? (contextMenu.ri === -1 ? tableData.headers[contextMenu.ci].color : tableData.rows[contextMenu.ri].cells[contextMenu.ci].color) || '#000' : '#000' }}>
                  <input type="color" onChange={e => applyStyleToSelection('color', e.target.value)} style={{ position: 'absolute', top: -10, left: -10, width: '150%', height: '150%', cursor: 'pointer', border: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {['#000000', '#ffffff', '#ef4444', '#22c55e', '#3b82f6', themeColor].map(c => (
                    <div key={c} onClick={() => applyStyleToSelection('color', c)} style={{ ...colorSwatch(c), width: '18px', height: '18px' }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toolBtn(bg) {
  return { background: bg, color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' };
}
function menuHeader() {
  return { fontSize: '9px', fontWeight: 900, marginBottom: '2px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' };
}
function styleBtn() {
  return { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd', background: '#f9fafb', borderRadius: '3px', padding: '4px', cursor: 'pointer' };
}
function actionBtn() {
  return { padding: '6px', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', borderRadius: '4px', background: '#f8fafc', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' };
}
function deleteBtn() {
  return { padding: '6px', fontSize: '10px', fontWeight: 700, border: '1px solid #fee2e2', borderRadius: '4px', background: '#fff1f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', gridColumn: 'span 2' };
}
function themeBtn(themeColor) {
  return { flex: 1, padding: '6px', fontSize: '10px', fontWeight: 800, border: `1px solid ${themeColor}`, borderRadius: '6px', background: 'white', color: themeColor, cursor: 'pointer' };
}
function colorGrid() {
  return { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '3px' };
}
function colorSwatch(c) {
  return { width: '22px', height: '22px', background: c, border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer' };
}
