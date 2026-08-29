import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Users, User, Search, Download, Trash2, Edit, Save, Plus, X, 
  TrendingUp, Calendar, BookOpen, AlertCircle, Award, BarChart, 
  CheckCircle, XCircle, Printer, ClipboardPaste, Files, FileText, WalletCards, Scale, Phone, MapPin
} from 'lucide-react';
import { 
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, AreaChart, Area 
} from 'recharts';
import * as XLSX from 'xlsx';
import { backendRequest } from '../services/apiClient';

const EMPTY_STAFF = {
  name: '', contact: '', email: '', gender: 'M',
  qualification: '', subject: '', assignedClass: '',
  role: 'TEACHER', salary: '', grossSalary: '', allowance: '',
  paye: '0', otherDeductions: '0',
  ssnitNumber: '', employerSsnitPercent: '13', employeeSsnitPercent: '5.5',
  bankName: '', accountNumber: '', documents: [],
  employedDate: '', dob: '', residence: '', notes: '', photo: ''
};

export default function Staff({ 
  staff = [], 
  setStaff, 
  staffAttendance = [], 
  setStaffAttendance, 
  currency = '₵', 
  convertAmount = (val) => val, 
  allClasses = [], 
  schoolInfo = {}, 
  settings = {},
  syncWithBackend,
  backendUrl,
  token,
  userRole = 'ADMIN'
}) {
  const toggleStaffAttendance = async (sId, status) => {
    const today = new Date().toISOString().split('T')[0];
    const timeIn = new Date().toTimeString().split(' ')[0].slice(0, 5); // "HH:MM"
    
    const existing = staffAttendance.find(record => record.staffId === sId && record.date === today);
    const record = {
            id: existing?.id || `${sId}-${today}`,
            staffId: sId,
            date: today,
            status,
            timeIn: status === 'present' ? timeIn : null,
            schoolId: staff.find(s => s.id === sId)?.schoolId
        };
    const saved = await syncWithBackend?.('staffAttendance', record, existing ? 'update' : 'add', existing?.id || null);
    if (!saved) return;
    setStaffAttendance(previous => [...previous.filter(item => !(item.staffId === sId && item.date === today)), record]);
  };
  const [showModal, setShowModal] = useState(false);
  const [profileTab, setProfileTab] = useState('info'); // 'info', 'performance', 'attendance'
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [printLayout, setPrintLayout] = useState('dual'); // 'full' or 'dual'
  const [showPayroll, setShowPayroll] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState([]);
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [searchQuery, setSearchQuery] = useState(() => initialParams.get('staffSearch') || '');
  const [roleFilter, setRoleFilter] = useState(() => initialParams.get('staffRole') || 'all');
  const [page, setPage] = useState(() => Math.max(1, Number(initialParams.get('staffPage')) || 1));
  const [pageSize, setPageSize] = useState(() => Math.max(10, Number(initialParams.get('staffPageSize')) || 20));
  const payrollPeriod = new Date().toISOString().slice(0, 7);
  const [payrollApproval, setPayrollApproval] = useState(() => settings.payrollApproval || { period: payrollPeriod, status: 'draft' });
  const [form, setForm] = useState(EMPTY_STAFF);
  const [initialForm, setInitialForm] = useState(EMPTY_STAFF);
  const payrollRef = useRef(null);
  const importRef = useRef(null);
  const photoRef = useRef(null);

  const roles = ['TEACHER', 'HEAD TEACHER', 'ASSISTANT HEAD', 'ADMIN', 'ACCOUNTANT', 'JANITOR', 'SECURITY', 'COOK', 'OTHER'];

  useEffect(() => {
    if (!backendUrl || !token || !['ADMIN', 'ACCOUNTANT'].includes(userRole)) return;
    backendRequest(backendUrl, token, `/payroll/approval?period=${encodeURIComponent(payrollPeriod)}`)
      .then(data => setPayrollApproval(data?.item || { period: payrollPeriod, status: 'draft' }))
      .catch(error => console.warn('Payroll approval could not be loaded', error));
  }, [backendUrl, payrollPeriod, token, userRole]);

  const filtered = useMemo(() => {
    return staff.filter(s => {
      const matchesSearch = !searchQuery ||
        (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.contact || '').includes(searchQuery) ||
        (s.assignedClass || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || s.role === roleFilter;
      return matchesSearch && matchesRole;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [staff, searchQuery, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedStaff = filtered.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize);
  const expiringDocuments = useMemo(() => {
    const cutoff = Date.now() + 60 * 86400000;
    return staff.flatMap(member => (member.documents || []).map(doc => ({ ...doc, member })))
      .filter(({ expiryDate }) => expiryDate && new Date(expiryDate).getTime() <= cutoff)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [staff]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const write = (key, value, fallback) => value && value !== fallback ? params.set(key, value) : params.delete(key);
    write('staffSearch', searchQuery, '');
    write('staffRole', roleFilter, 'all');
    write('staffPage', String(Math.min(page, totalPages)), '1');
    write('staffPageSize', String(pageSize), '20');
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
  }, [searchQuery, roleFilter, page, pageSize, totalPages]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openAdd = () => {
    const nextForm = { ...EMPTY_STAFF };
    setForm(nextForm);
    setInitialForm(nextForm);
    setEditingStaff(null);
    setShowModal(true);
  };
  const openEdit = (s) => {
    const nextForm = { ...s };
    setForm(nextForm);
    setInitialForm(nextForm);
    setEditingStaff(s);
    setShowModal(true);
  };
  const closeStaffModal = () => {
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
    if (isDirty && !window.confirm('Discard your unsaved staff changes?')) return;
    setShowModal(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const record = editingStaff
      ? { ...editingStaff, ...form }
      : { ...form, id: crypto.randomUUID(), staffId: `STF-${Date.now().toString().slice(-4)}` };
    const saved = await syncWithBackend?.('staff', record, editingStaff ? 'update' : 'add', editingStaff?.id || null);
    if (!saved) return alert('Staff changes were not saved.');
    setStaff(previous => editingStaff
      ? previous.map(item => item.id === editingStaff.id ? record : item)
      : [...previous, record]);
    setShowModal(false);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(staff.map(s => ({
      ID: s.staffId, Name: s.name, Role: s.role, Contact: s.contact,
      Employed: s.employedDate, 'Gross Salary': s.grossSalary || s.salary,
      Allowance: s.allowance || 0, 'Employer SSNIT %': s.employerSsnitPercent,
      'Employee SSNIT %': s.employeeSsnitPercent, 'Bank Name': s.bankName,
      SSNIT: s.ssnitNumber || '', Qualification: s.qualification,
      Subject: s.subject, Class: s.assignedClass
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'Staff_Records.xlsx');
  };

  const importFromExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const newStaff = data.map((row, i) => ({
        id: (Date.now() + i).toString(),
        staffId: String(row.ID || row.StaffID || `STF-${Date.now() + i}`).toUpperCase(),
        name: String(row.Name || row.FullName || 'Unknown').toUpperCase(),
        role: String(row.Role || 'TEACHER').toUpperCase(),
        contact: String(row.Contact || 'N/A'),
        email: String(row.Email || ''),
        ssnitNumber: String(row.SSNIT || row.SSNITNumber || ''),
        salary: parseFloat(row.Salary || 0),
        grossSalary: parseFloat(row['Gross Salary'] || row.GrossSalary || row.Salary || 0),
        allowance: parseFloat(row.Allowance || 0),
        paye: parseFloat(row.PAYE || 0),
        otherDeductions: parseFloat(row['Other Deductions'] || row.OtherDeductions || 0),
        employerSsnitPercent: parseFloat(row['Employer SSNIT %'] || row.EmployerSsnitPercent || 13),
        employeeSsnitPercent: parseFloat(row['Employee SSNIT %'] || row.EmployeeSsnitPercent || 5.5),
        bankName: String(row['Bank Name'] || row.BankName || ''),
        accountNumber: String(row['Account Number'] || row.AccountNumber || ''),
        qualification: String(row.Qualification || ''),
        subject: String(row.Subject || ''),
        assignedClass: String(row.Class || row.AssignedClass || ''),
        gender: String(row.Gender || 'M').toUpperCase().charAt(0),
        employedDate: String(row.EmployedDate || row.Employed || ''),
        dob: String(row.DOB || ''),
        residence: String(row.Residence || ''),
        notes: String(row.Notes || ''),
        photo: ''
      }));
      try {
        if (!syncWithBackend || navigator.onLine === false) throw new Error('Staff import requires a live backend connection.');
        const results = await Promise.all(newStaff.map(item => syncWithBackend('staff', item, 'add')));
        const accepted = newStaff.filter((_, index) => results[index] !== false);
        if (!accepted.length) throw new Error('The backend rejected the staff import.');
        setStaff(previous => [...previous, ...accepted]);
        const queued = results.filter(result => result === 'queued').length;
        alert(`${accepted.length} staff member(s) imported${queued ? `; ${queued} queued for synchronization` : ''}.`);
      } catch (error) {
        alert(error.message || 'Staff import failed. No records were added.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const parsePastedData = (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    const firstCols = lines[0].split(/\t|,/).map(c => c.trim().toLowerCase());
    const hasHeader = firstCols.some(c => ['name', 'salary', 'contact', 'ssnit', 'role'].includes(c));
    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line, i) => {
      const cols = line.split(/\t/).map(c => c.trim());
      const parts = cols.length > 1 ? cols : line.split(',').map(c => c.trim());
      if (hasHeader) {
        const hdr = firstCols;
        const get = (keys) => parts[keys.map(k => hdr.indexOf(k)).find(i => i >= 0)] || '';
        return {
          id: (Date.now() + i).toString(),
          staffId: `STF-${(Date.now() + i).toString().slice(-4)}`,
          name: (get(['name', 'fullname']) || '').toUpperCase(),
          contact: get(['contact', 'phone', 'tel']),
          ssnitNumber: get(['ssnit', 'ssnit number', 'ssnitnumber']),
          salary: parseFloat(get(['salary', 'pay'])) || 0,
          role: (get(['role', 'position']) || 'TEACHER').toUpperCase(),
          assignedClass: get(['class', 'assignedclass']),
          qualification: get(['qualification', 'qual']),
          subject: get(['subject', 'specialisation']),
          email: get(['email']),
          gender: (get(['gender']) || 'M').toUpperCase().charAt(0),
          employedDate: '', dob: '', residence: '', notes: '', photo: ''
        };
      } else {
        return {
          id: (Date.now() + i).toString(),
          staffId: `STF-${(Date.now() + i).toString().slice(-4)}`,
          name: (parts[0] || '').toUpperCase(),
          contact: parts[1] || '',
          ssnitNumber: parts[2] || '',
          salary: parseFloat(parts[3]) || 0,
          role: (parts[4] || 'TEACHER').toUpperCase(),
          assignedClass: parts[5] || '',
          qualification: parts[6] || '',
          email: '', gender: 'M', subject: '',
          employedDate: '', dob: '', residence: '', notes: '', photo: ''
        };
      }
    }).filter(s => s.name && s.name !== 'UNDEFINED');
  };

  const handlePasteChange = (text) => {
    setPasteText(text);
    setPastePreview(parsePastedData(text));
  };

  const confirmPaste = async () => {
    const parsed = parsePastedData(pasteText);
    if (!parsed.length) return alert('No valid data found. Check format.');
    try {
      if (!syncWithBackend || navigator.onLine === false) throw new Error('Staff import requires a live backend connection.');
      const results = await Promise.all(parsed.map(item => syncWithBackend('staff', item, 'add')));
      const accepted = parsed.filter((_, index) => results[index] !== false);
      if (!accepted.length) throw new Error('The backend rejected the staff import.');
      setStaff(previous => [...previous, ...accepted]);
      const queued = results.filter(result => result === 'queued').length;
      alert(`${accepted.length} staff member(s) imported${queued ? `; ${queued} queued for synchronization` : ''}.`);
      setShowPaste(false);
      setPasteText('');
      setPastePreview([]);
    } catch (error) {
      alert(error.message || 'Staff import failed. No records were added.');
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setForm(prev => ({ ...prev, photo: evt.target.result }));
    reader.readAsDataURL(file);
  };

  const printPayroll = () => {
    const content = payrollRef.current;
    const win = window.open('', '_blank');
    if (!win) {
      alert('The payroll print window was blocked. Allow popups for this site and try again.');
      return false;
    }
    win.document.write(`
      <html><head><title>Monthly Payroll</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
        h2, h3 { text-align: center; margin: 4px 0; }
        p { text-align: center; font-size: 12px; margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th { background: #6b21a8; color: white; padding: 8px; text-align: left; }
        td { border: 1px solid #ccc; padding: 7px 10px; }
        tr:nth-child(even) td { background: #f5f5f5; }
        .total-row td { font-weight: bold; background: #ede9fe; }
        .footer { margin-top: 30px; display: flex; justify-content: space-between; }
        .sig { border-top: 1px solid #333; width: 180px; text-align: center; padding-top: 4px; font-size: 12px; }
      </style></head><body>
      ${content.innerHTML}
      <div class="footer">
        <div class="sig">Prepared By</div>
        <div class="sig">Approved By</div>
        <div class="sig">Date</div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
    return true;
  };

  const printPayslips = (staffArray, layout = 'dual') => {
    if (!staffArray?.length) {
      alert('Select at least one staff member to print.');
      return false;
    }
    const win = window.open('', '_blank');
    if (!win) {
      alert('The payslip print window was blocked. Allow popups for this site and try again.');
      return false;
    }
    let html = `<html><head><title>Staff Payslips</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
        body { font-family: 'Times New Roman', serif; padding: 20px; color: #000; line-height: 1.3; background: #fff; margin: 0; }
        .page-break { page-break-after: always; }
        .payslip-container { 
          width: 100%; 
          max-width: 190mm; 
          height: ${layout === 'full' ? '270mm' : '135mm'};
          margin: 0 auto; 
          border: 1px solid #333; 
          padding: 15px;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          overflow: hidden;
          position: relative;
        }
        .header { display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 10px; }
        .logo { width: 50px; height: 50px; object-fit: cover; }
        .header-text { text-align: center; }
        .header h1 { margin: 0; font-size: ${layout === 'full' ? '32px' : '18px'}; text-decoration: underline; letter-spacing: 2px; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: ${layout === 'full' ? '25px' : '10px'}; }
        .info-table td { border: 1px solid #000; padding: ${layout === 'full' ? '12px 15px' : '4px 10px'}; font-size: ${layout === 'full' ? '18px' : '12px'}; }
        .info-table td:nth-child(odd) { width: 22%; background: #f2f2f2; font-weight: bold; }
        
        .salary-section h2 { font-size: ${layout === 'full' ? '22px' : '14px'}; margin-bottom: 15px; border-bottom: 2px solid #000; display: inline-block; }
        .salary-table td { border: 1px solid #000; padding: ${layout === 'full' ? '15px 18px' : '5px 10px'}; font-size: ${layout === 'full' ? '18px' : '12px'}; }
        .salary-table td:first-child { width: 60%; font-weight: bold; }
        .salary-table td:last-child { text-align: right; }

        .net-row { background: #eee; font-weight: bold; font-size: ${layout === 'full' ? '22px' : '14px'}; }
        .signatures { margin-top: auto; display: flex; justify-content: space-between; padding-bottom: ${layout === 'full' ? '40px' : '10px'}; }
        .sig-box { width: 40%; }
        .sig-line { border-top: 2px solid #000; margin-top: ${layout === 'full' ? '60px' : '35px'}; text-align: center; font-size: ${layout === 'full' ? '16px' : '12px'}; font-weight: bold; }
        
        .cut-line { 
          width: 100%; 
          border-top: 1px dashed #999; 
          margin: 15px 0; 
          position: relative; 
          display: none; 
        }
        .cut-line:after { 
          content: 'PAGE CUTTING LINE'; 
          position: absolute; 
          top: -10px; 
          right: 20px; 
          font-size: 8px; 
          color: #999; 
          background: #fff; 
          padding: 0 5px; 
        }

        @media print { 
          body { padding: 0; }
          .cut-line { display: block !important; }
        }
      </style></head><body>`;

    staffArray.forEach((s, index) => {
      const gross = parseFloat(s.grossSalary || s.salary) || 0;
      const allow = parseFloat(s.allowance) || 0;
      const ssSub = gross * (parseFloat(s.employeeSsnitPercent || 5.5) / 100);
      const tax = parseFloat(s.paye || 0);
      const others = parseFloat(s.otherDeductions || 0);
      const net = (gross + allow) - (ssSub + tax + others);
      const dept = (s.role === 'TEACHER') ? (s.assignedClass?.includes('JHS') ? 'JUNIOR HIGH' : 'PRE-SCHOOL') : 'ADMINISTRATION';
      const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
      const payDate = new Date().toLocaleDateString('en-GB');

      const renderSlip = (copyType) => `
        <div class="payslip-container">
          <div class="header">
            ${settings.logoUrl ? `<img src="${settings.logoUrl}" class="logo" />` : ''}
            <div class="header-text">
              <h1>SCHOOL PAYSLIP</h1>
              <p style="margin:2px 0; font-size: ${layout === 'full' ? '18px' : '14px'};"><strong>${schoolName.toUpperCase()}</strong></p>
              <small style="font-size: 9px; opacity:0.6;">(${copyType})</small>
            </div>
          </div>
          <table class="info-table">
            <tr><td>Employee Name</td><td>${s.name}</td><td>Staff No.</td><td>${s.staffId}</td></tr>
            <tr><td>Position</td><td>${s.role}</td><td>Department</td><td>${dept}</td></tr>
            <tr><td>Month</td><td>${monthYear}</td><td>Payment Date</td><td>${payDate}</td></tr>
            <tr><td>Bank Name</td><td>${s.bankName || 'N/A'}</td><td>Account Number</td><td>${s.accountNumber || 'N/A'}</td></tr>
            <tr><td>Employee Status</td><td>ACTIVE</td><td>Residence</td><td>${s.residence || 'N/A'}</td></tr>
          </table>
          <div class="salary-section">
            <h2 style="margin-top:0;">Salary Details</h2>
            <table class="salary-table">
              <tr><td>Basic Salary</td><td>${currency} ${convertAmount(gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr><td>Allowances</td><td>${currency} ${convertAmount(allow).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr style="background:#f9f9f9;"><td>Gross Salary</td><td>${currency} ${convertAmount(gross + allow).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr><td>SSNIT Deduction (5.5%)</td><td>- ${currency} ${convertAmount(ssSub).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr><td>PAYE (Tax)</td><td>- ${currency} ${convertAmount(tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr><td>Other Deductions</td><td>- ${currency} ${convertAmount(others).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              <tr class="net-row"><td>NET SALARY</td><td>${currency} ${convertAmount(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            </table>
          </div>
          <div class="signatures" style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 20px;">
            <div class="sig-box" style="display: flex; flex-direction: column; align-items: center; min-width: 180px;">
              ${settings.headSignatureUrl ? `<img src="${settings.headSignatureUrl}" style="width: ${settings.headSigWidth || 120}px; height: ${settings.headSigHeight || 45}px; object-fit: fill; display: block; margin-bottom: 4px;" />` : `<div style="height:49px"></div>`}
              <div style="border-top: 2px solid #000; width: 100%; text-align: center; font-size: ${layout === 'full' ? '14px' : '11px'}; font-weight: bold; padding-top: 4px;">
                Head of School
              </div>
            </div>
            <div class="sig-box" style="display: flex; flex-direction: column; align-items: center; min-width: 180px;">
              ${settings.accountantSignatureUrl ? `<img src="${settings.accountantSignatureUrl}" style="width: ${settings.sigWidth || 120}px; height: ${settings.sigHeight || 45}px; object-fit: fill; display: block; margin-bottom: 4px; filter: contrast(1.1) brightness(0.95);" />` : `<div style="height:49px"></div>`}
              <div style="border-top: 2px solid #000; width: 100%; text-align: center; font-size: ${layout === 'full' ? '14px' : '11px'}; font-weight: bold; padding-top: 4px;">
                Accountant Signature
              </div>
            </div>
          </div>
        </div>
      `;

      if (layout === 'dual') {
        html += renderSlip('EMPLOYEE COPY');
        html += `<div class="cut-line"></div>`;
        html += renderSlip('OFFICE COPY');
      } else {
        html += renderSlip('EMPLOYEE COPY');
      }

      if (index < staffArray.length - 1) html += `<div class="page-break"></div>`;
    });

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
    return true;
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(filtered.map(s => s.id));
    else setSelectedIds([]);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const totalGross = staff.reduce((sum, s) => sum + (parseFloat(s.grossSalary || s.salary) || 0), 0);
  const totalAllowances = staff.reduce((sum, s) => sum + (parseFloat(s.allowance) || 0), 0);
  const totalEmployeeSSNIT = staff.reduce((sum, s) => {
    const basic = parseFloat(s.grossSalary || s.salary) || 0;
    const percent = parseFloat(s.employeeSsnitPercent) || 5.5;
    return sum + (basic * (percent / 100));
  }, 0);
  const totalNet = totalGross + totalAllowances - totalEmployeeSSNIT;

  const transitionPayroll = async (action) => {
    try {
      const data = await backendRequest(backendUrl, token, '/payroll/approval', {
        method: 'POST',
        body: { action, period: payrollPeriod, grossTotal: totalGross, netTotal: totalNet }
      });
      setPayrollApproval(data.item);
    } catch (error) {
      alert(error.message || 'Payroll approval could not be updated.');
    }
  };

  const schoolName = schoolInfo?.schoolName || 'TRUE STAR MONTESSORI';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <section className="view active staff-page-view">
      <style>{`
        @media (max-width: 600px) {
          .staff-edit-form .form-group { width: 100% !important; }
        }
      `}</style>

      <div className="view-header">
        <h1>Staff Management</h1>
        <div className="toolbar-group">
          <input type="file" accept=".xlsx,.xls,.csv" ref={importRef} style={{ display: 'none' }} onChange={importFromExcel} />
          <button className="btn btn-secondary" onClick={() => importRef.current.click()}>
            <Download size={16} /> Import
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowPaste(true); setPasteText(''); setPastePreview([]); }}>
            <ClipboardPaste size={16} /> Paste
          </button>
          <button className="btn btn-secondary" onClick={exportToExcel}>
            <Download size={16} /> Export
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <div className="flex-gap" style={{ alignItems: 'center' }}>
            {selectedIds.length > 0 && (
              <button className="btn btn-primary" onClick={() => setShowBulkPrintModal(true)}>
                <Printer size={18} /> Print {selectedIds.length} Slips
              </button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> Add Staff
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Print Modal */}
      {showBulkPrintModal && (
        <div className="modal" onClick={() => setShowBulkPrintModal(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="flex-between mb-1">
              <h2 style={{ margin: 0 }}>Payslip Print Options</h2>
               <button className="btn btn-icon btn-secondary" aria-label="Close payslip print options" onClick={() => setShowBulkPrintModal(false)}><X size={20} /></button>
            </div>

            <p style={{ fontSize: '14px', opacity: 0.7, marginBottom: '20px' }}>
              Select your preferred layout for printing <strong>{selectedIds.length || 1}</strong> payslip(s).
            </p>

            <div className="form-group">
              <label>Layout Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div
                  className={`card ${printLayout === 'dual' ? 'selected-row' : ''}`}
                  onClick={() => setPrintLayout('dual')}
                  style={{ cursor: 'pointer', textAlign: 'center', padding: '15px', border: printLayout === 'dual' ? '2px solid var(--accent)' : '1.5px solid var(--border-color)' }}
                >
                  <Files size={20} style={{ marginBottom: '5px' }} />
                  <strong style={{ fontSize: '12px' }}>Standard (Dual)</strong>
                  <p style={{ fontSize: '10px', margin: 0, opacity: 0.6 }}>2 Slips per page</p>
                </div>
                <div
                  className={`card ${printLayout === 'full' ? 'selected-row' : ''}`}
                  onClick={() => setPrintLayout('full')}
                  style={{ cursor: 'pointer', textAlign: 'center', padding: '15px', border: printLayout === 'full' ? '2px solid var(--accent)' : '1.5px solid var(--border-color)' }}
                >
                  <FileText size={20} style={{ marginBottom: '5px' }} />
                  <strong style={{ fontSize: '12px' }}>Full Page</strong>
                  <p style={{ fontSize: '10px', margin: 0, opacity: 0.6 }}>1 Slip per page</p>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBulkPrintModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const targets = selectedIds.length > 0 ? staff.filter(s => selectedIds.includes(s.id)) : [selectedStaff];
                 if (printPayslips(targets, printLayout)) setShowBulkPrintModal(false);
              }}>
                <Printer size={18} /> Confirm & Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="dashboard-kpi-grid">
        <article className="dashboard-kpi-card tone-blue">
          <span className="dashboard-kpi-icon"><Users size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Total Staff</small><strong>{staff.length}</strong><em>All staff records</em></span>
        </article>
        <article className="dashboard-kpi-card tone-blue">
          <span className="dashboard-kpi-icon"><BookOpen size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Teachers</small><strong>{staff.filter(s => ['TEACHER', 'HEAD TEACHER', 'ASSISTANT HEAD'].includes(s.role)).length}</strong><em>Teaching staff</em></span>
        </article>
        <article className="dashboard-kpi-card tone-green" style={{ cursor: 'pointer' }}
          onClick={() => setShowPayroll(true)}>
          <span className="dashboard-kpi-icon"><WalletCards size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Monthly Payroll</small><strong>{currency}{convertAmount(totalNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><em>Click to view sheet</em></span>
        </article>
        <article className="dashboard-kpi-card tone-blue">
          <span className="dashboard-kpi-icon"><Scale size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Staff Ratio (M/F)</small><strong>{staff.filter(s => s.gender === 'M').length} : {staff.filter(s => s.gender === 'F').length}</strong><em>Gender distribution</em></span>
        </article>
      </div>

      {expiringDocuments.length > 0 && (
        <div className="card no-print" role="alert" style={{ marginBottom: 16, padding: 14, border: '1px solid #f59e0b55', background: '#f59e0b11' }}>
          <strong style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#b45309' }}><AlertCircle size={17} /> Document expiry reminders</strong>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {expiringDocuments.slice(0, 8).map((doc, i) => <button key={`${doc.member.id}-${doc.id || i}`} className="btn btn-secondary" onClick={() => { setSelectedStaff(doc.member); setProfileTab('documents'); }} style={{ fontSize: 11 }}>{doc.member.name}: {doc.name || doc.type || 'Document'} {new Date(doc.expiryDate) < new Date() ? 'expired' : 'expires'} {doc.expiryDate}</button>)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-2 no-print" style={{ padding: '15px' }}>
        <div className="toolbar-group flex-between" style={{ flexWrap: 'wrap', gap: '15px' }}>
          <div className="premium-search" style={{ flex: '1 1 100%', maxWidth: '350px' }}>
            <input type="text" placeholder="Search staff by name or class..." value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }} style={{ fontSize: '13px', padding: '10px 12px 10px 38px' }} />
            <Search className="search-icon" size={16} style={{ left: '12px' }} />
          </div>
          <select className="btn btn-outline" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="staff-table-wrapper table-responsive" style={{ fontSize: '11px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '0' }}>

        <table className="table" style={{ width: '100%', minWidth: '500px', borderSpacing: '0' }}>
          <thead>
            <tr>
              <th className="no-print" style={{ width: '30px', padding: '8px 4px' }}>
                <input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === filtered.length && filtered.length > 0} />
              </th>
              <th style={{ padding: '8px 4px' }}>ID</th>
              <th style={{ padding: '8px 4px' }}>Name</th>
              <th style={{ padding: '8px 4px' }}>Role</th>
              <th style={{ padding: '8px 4px' }}>Class</th>
              <th style={{ padding: '8px 4px' }}>Contact</th>
              <th className="mobile-hide" style={{ padding: '8px 4px' }}>Qual.</th>
              <th className="mobile-hide" style={{ padding: '8px 4px' }}>SSNIT</th>
              <th style={{ padding: '8px 4px' }}>Salary</th>
              <th className="no-print" style={{ padding: '8px 4px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>
                <User size={40} /><br />No staff records found
              </td></tr>
            ) : pagedStaff.map(s => {
              const isSelected = selectedIds.includes(s.id);
              return (
                <tr key={s.id} className={isSelected ? 'selected-row' : ''}>
                  <td className="no-print" style={{ padding: '8px 4px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(s.id)} />
                  </td>
                  <td style={{ fontSize: '10px', color: 'var(--text-main)', padding: '8px 4px', whiteSpace: 'nowrap' }}>{s.staffId}</td>
                  <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>
                    <a href="#" className="name-link" onClick={e => { e.preventDefault(); setSelectedStaff(s); }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {s.photo
                          ? <img src={s.photo} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                          : <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={12} color="var(--accent)" />
                          </div>
                        }
                        <span style={{ fontWeight: 800, fontSize: '12px' }}>{s.name}</span>
                      </div>
                    </a>
                  </td>
                  <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                      {s.role}
                    </span>
                  </td>
                  <td style={{ padding: '8px 4px', whiteSpace: 'nowrap', fontSize: '11px' }}>{s.assignedClass || '—'}</td>
                  <td style={{ fontSize: '11px', padding: '8px 4px', whiteSpace: 'nowrap' }}>{s.contact}</td>
                  <td className="mobile-hide" style={{ padding: '8px 4px', whiteSpace: 'nowrap', fontSize: '11px' }}>{s.qualification}</td>
                  <td className="mobile-hide" style={{ fontSize: '11px', padding: '8px 4px', whiteSpace: 'nowrap' }}>{s.ssnitNumber || '—'}</td>
                  <td style={{ fontWeight: 900, color: 'var(--success)', whiteSpace: 'nowrap', padding: '8px 4px', fontSize: '12px' }}>
                    {currency}{convertAmount(s.grossSalary || s.salary || 0).toLocaleString()}
                  </td>
                  <td className="flex-gap no-print" style={{ padding: '8px 4px', whiteSpace: 'nowrap', gap: '5px' }}>
                     <button className="btn btn-icon btn-secondary" aria-label={`Print payslip for ${s.name}`} style={{ width: '28px', height: '28px', padding: 0 }} onClick={() => printPayslips([s], printLayout)}>
                      <Printer size={14} />
                    </button>
                     <button className="btn btn-icon btn-secondary" aria-label={`Edit ${s.name}`} style={{ width: '28px', height: '28px', padding: 0 }} onClick={() => openEdit(s)}>
                      <Edit size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {staff.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                <td colSpan="8">TOTAL: {filtered.length} staff</td>
                <td style={{ color: 'var(--primary)' }}>
                  {currency}{convertAmount(filtered.reduce((sum, s) => sum + (parseFloat(s.grossSalary || s.salary) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="no-print" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length > 0 && <div className="no-print flex-between" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {Math.min(page, totalPages)} of {totalPages} · {filtered.length} records</span>
        <div className="flex-gap">
          <select aria-label="Rows per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}><option value="10">10 / page</option><option value="20">20 / page</option><option value="50">50 / page</option></select>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>}

      {/* ── PASTE DATA MODAL ──────────────────────────────────── */}
      {showPaste && (
        <div className="modal" onClick={() => setShowPaste(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '95%' }}>
            <div className="flex-between mb-2">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ClipboardPaste size={20} /> Paste Staff Data</h2>
               <button className="btn btn-icon btn-secondary" aria-label="Close paste staff data dialog" onClick={() => setShowPaste(false)}><X size={20} /></button>
            </div>
            <div style={{ background: 'var(--accent-glow)', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '13px', lineHeight: '1.7' }}>
              <strong>How to use:</strong><br />
              Copy rows directly from <strong>Excel or Google Sheets</strong> and paste below.<br />
              <strong>Column order (no header):</strong> <code>Name | Contact | SSNIT | Salary | Role | Class | Qualification</code><br />
              Or include a <strong>header row</strong> with column names — the system will auto-map them.
            </div>
            <div className="form-group">
              <label>Paste here (Ctrl+V / Cmd+V)</label>
              <textarea
                rows={8}
                value={pasteText}
                onChange={e => handlePasteChange(e.target.value)}
                placeholder={`KWAME MENSAH\t0244123456\tC001234567\t2500\tTEACHER\tBASIC 4A\nABENA ASANTE\t0277654321\tC007654321\t2200\tTEACHER\tKINDERGARTEN 1B`}
                style={{ fontFamily: 'monospace', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>

            {pastePreview.length > 0 && (
              <>
                <p style={{ opacity: 0.7, fontSize: '13px', margin: '8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={15} /> Preview: <strong>{pastePreview.length}</strong> record(s) detected</p>
                <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                  <table className="table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Name</th><th>Contact</th><th>SSNIT</th>
                        <th>Salary</th><th>Role</th><th>Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastePreview.slice(0, 8).map((s, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td>{s.contact}</td>
                          <td style={{ fontFamily: 'monospace' }}>{s.ssnitNumber || '—'}</td>
                          <td>{currency}{convertAmount(s.salary || 0).toLocaleString()}</td>
                          <td>{s.role}</td>
                          <td>{s.assignedClass || '—'}</td>
                        </tr>
                      ))}
                      {pastePreview.length > 8 && (
                        <tr><td colSpan="6" style={{ textAlign: 'center', opacity: 0.5 }}>...and {pastePreview.length - 8} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowPaste(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPaste} disabled={pastePreview.length === 0}>
                Import {pastePreview.length > 0 ? `${pastePreview.length} Staff` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYROLL MODAL ──────────────────────────────────────── */}
      {showPayroll && (
        <div className="modal" onClick={() => setShowPayroll(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div className="flex-between mb-2">
              <h2 style={{ margin: 0 }}>Monthly Payroll Sheet</h2>
              <div className="toolbar-group">
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: payrollApproval.status === 'approved' ? '#10b981' : payrollApproval.status === 'submitted' ? '#f59e0b' : 'var(--text-muted)' }}>{payrollApproval.status}</span>
                {['draft', 'reopened'].includes(payrollApproval.status) && <button className="btn btn-secondary" onClick={() => transitionPayroll('submit')}>Submit Payroll</button>}
                {payrollApproval.status === 'submitted' && userRole === 'ADMIN' && <button className="btn btn-primary" onClick={() => transitionPayroll('approve')}>Approve Payroll</button>}
                {['submitted', 'approved'].includes(payrollApproval.status) && userRole === 'ADMIN' && <button className="btn btn-secondary" onClick={() => transitionPayroll('reopen')}>Reopen</button>}
                <button className="btn btn-primary" onClick={printPayroll}><Printer size={16} /> Print</button>
                 <button className="btn btn-icon btn-secondary" aria-label="Close monthly payroll" onClick={() => setShowPayroll(false)}><X size={20} /></button>
              </div>
            </div>

            <div ref={payrollRef}>
              <h2 style={{ textAlign: 'center', margin: '4px 0' }}>{schoolName}</h2>
              <h3 style={{ textAlign: 'center', margin: '4px 0' }}>MONTHLY PAYROLL SHEET</h3>
              <p style={{ textAlign: 'center', fontSize: '13px', opacity: 0.7 }}>Date: {today}</p>

              <table className="table" style={{ marginTop: '16px' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Staff Name</th>
                    <th>Role</th>
                    <th>Gross Salary</th>
                    <th>Allowance</th>
                    <th>SSNIT (5.5%)</th>
                    <th style={{ textAlign: 'right' }}>Net Pay ({currency})</th>
                    <th style={{ width: '80px' }}>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {[...staff].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((s, i) => {
                    const gross = parseFloat(s.grossSalary || s.salary) || 0;
                    const allow = parseFloat(s.allowance) || 0;
                    const ss = gross * (parseFloat(s.employeeSsnitPercent || 5.5) / 100);
                    const net = gross + allow - ss;
                    return (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{s.name}</td>
                        <td>{s.role}</td>
                        <td>{convertAmount(gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{convertAmount(allow).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>({convertAmount(ss).toLocaleString(undefined, { minimumFractionDigits: 2 })})</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                          {currency}{convertAmount(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ borderBottom: '1px solid #999' }}></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 900, background: 'var(--accent-glow)' }}>
                    <td colSpan="6" style={{ textAlign: 'right', paddingRight: '20px' }}>TOTAL NET PAYROLL:</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary)', fontSize: '1.1rem' }}>
                      {currency}{convertAmount(totalNet).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── STAFF PROFILE MODAL ────────────────────────────────── */}
      {selectedStaff && (
        <div className="modal" onClick={() => setSelectedStaff(null)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '95%' }}>
            <div className="flex-between mb-2" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', border: '3px solid var(--accent)', overflow: 'hidden' }}>
                  {selectedStaff.photo
                    ? <img src={selectedStaff.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <User size={40} color="var(--accent)" />}
                </div>
                <h2 style={{ margin: 0 }}>{selectedStaff.name}</h2>
                <span className="filter-pill" style={{ marginTop: '8px' }}>{selectedStaff.role}</span>
              </div>
               <button className="btn btn-icon btn-secondary" aria-label={`Close profile for ${selectedStaff.name}`} onClick={() => setSelectedStaff(null)}><X size={20} /></button>
            </div>

            {/* PROFILE TABS */}
            <div className="flex gap-4 border-b border-slate-100 mb-6">
              <button 
                onClick={() => setProfileTab('info')} 
                className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${profileTab === 'info' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}
              >
                Official Info
              </button>
              <button 
                onClick={() => setProfileTab('attendance')} 
                className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${profileTab === 'attendance' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}
              >
                Attendance Log
              </button>
              <button onClick={() => setProfileTab('documents')} className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${profileTab === 'documents' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}>Documents</button>
              <button onClick={() => setProfileTab('payroll')} className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${profileTab === 'payroll' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}>Payroll</button>
            </div>

            {profileTab === 'info' && (
              <div className="animate-fade-in">
                <div className="grid-2 gap-4">
                  <article className="dashboard-kpi-card tone-blue" style={{ padding: '12px' }}>
                    <span className="dashboard-kpi-icon"><Phone size={18} /></span>
                    <span className="dashboard-kpi-copy"><small>Contact</small><strong style={{ fontSize: '13px' }}>{selectedStaff.contact}</strong></span>
                  </article>
                  <article className="dashboard-kpi-card tone-amber" style={{ padding: '12px' }}>
                    <span className="dashboard-kpi-icon"><MapPin size={18} /></span>
                    <span className="dashboard-kpi-copy"><small>Residence</small><strong style={{ fontSize: '13px' }}>{selectedStaff.residence || 'N/A'}</strong></span>
                  </article>
                </div>
                {selectedStaff.notes && (
                  <div style={{ marginTop: '15px', padding: '12px', background: 'var(--accent-glow)', borderRadius: '10px', fontSize: '13px' }}>
                    <strong>Notes:</strong> {selectedStaff.notes}
                  </div>
                )}
                
                {/* Payroll Section */}
                <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-page)', borderRadius: '20px', border: '1.5px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 900 }}>Financial Structure</h4>
                  <div className="flex-between mb-2">
                    <span style={{ fontSize: '12px', opacity: 0.7 }}>Base Salary</span>
                    <span style={{ fontWeight: 800 }}>{currency} {convertAmount(selectedStaff.salary || 0)}</span>
                  </div>
                  <div className="flex-between" style={{ padding: '10px 0', borderTop: '1px dashed var(--border-color)', marginTop: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900 }}>Total Allowance</span>
                    <span style={{ fontWeight: 900, color: 'var(--success)' }}>{currency} {convertAmount(selectedStaff.allowance || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {profileTab === 'attendance' && (

              <div className="animate-fade-in">
                <div style={{ padding: '20px', background: 'var(--bg-page)', border: '1.5px dashed var(--accent)', borderRadius: '20px' }}>
                  <div className="flex-between mb-4">
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: 'var(--primary)' }}>TODAY'S ATTENDANCE</h4>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <button 
                      className={`btn py-3 border-2 transition-all ${staffAttendance.find(r => r.staffId === selectedStaff.id && r.date === new Date().toISOString().split('T')[0] && r.status === 'present') ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}
                      onClick={() => toggleStaffAttendance(selectedStaff.id, 'present')}
                    >
                      <CheckCircle size={16} /> Present
                    </button>
                    <button 
                      className={`btn py-3 border-2 transition-all ${staffAttendance.find(r => r.staffId === selectedStaff.id && r.date === new Date().toISOString().split('T')[0] && r.status === 'absent') ? 'bg-rose-500 border-rose-500 text-white shadow-lg' : 'bg-rose-50 border-rose-100 text-rose-600'}`}
                      onClick={() => toggleStaffAttendance(selectedStaff.id, 'absent')}
                    >
                      <XCircle size={16} /> Absent
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">RECENT HISTORY</h4>
                  <div className="space-y-2">
                    {staffAttendance
                      .filter(r => r.staffId === selectedStaff.id)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 5)
                      .map((r, i) => (
                        <div key={i} className="flex-between p-3 bg-slate-50 rounded-xl">
                          <span className="text-xs font-bold text-slate-600">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <div className="flex items-center gap-3">
                             {r.timeIn && <span className="text-[10px] font-bold text-slate-400">{r.timeIn}</span>}
                             <span className={`px-2 py-0.5 text-[9px] font-black rounded-lg ${r.status === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                               {r.status.toUpperCase()}
                             </span>
                          </div>
                        </div>
                      ))}
                    {staffAttendance.filter(r => r.staffId === selectedStaff.id).length === 0 && (
                      <p className="text-center py-4 text-xs opacity-50">No attendance records found.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {profileTab === 'documents' && <div className="animate-fade-in">
              {(selectedStaff.documents || []).length ? selectedStaff.documents.map((doc, i) => <div key={doc.id || i} className="flex-between" style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}><span><strong>{doc.name || doc.type || 'Document'}</strong><br /><small>{doc.reference || 'No reference'}</small></span><span style={{ color: doc.expiryDate && new Date(doc.expiryDate) < new Date() ? '#ef4444' : 'var(--text-muted)', fontSize: 12 }}>{doc.expiryDate ? `Expires ${doc.expiryDate}` : 'No expiry'}</span></div>) : <p style={{ textAlign: 'center', opacity: .55 }}>No documents recorded.</p>}
            </div>}
            {profileTab === 'payroll' && <div className="animate-fade-in" style={{ padding: 16, background: 'var(--bg-page)', borderRadius: 14 }}>
              <div className="flex-between"><span>Gross salary</span><strong>{currency}{convertAmount(selectedStaff.grossSalary || selectedStaff.salary || 0).toLocaleString()}</strong></div>
              <div className="flex-between" style={{ marginTop: 10 }}><span>Payroll approval</span><strong style={{ textTransform: 'capitalize' }}>{payrollApproval.status}</strong></div>
              {payrollApproval.updatedAt && <small style={{ display: 'block', marginTop: 8, opacity: .55 }}>Updated {new Date(payrollApproval.updatedAt).toLocaleString()}</small>}
            </div>}

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedStaff(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setSelectedStaff(null); openEdit(selectedStaff); }}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ───────────────────────────────────── */}
      {showModal && (
        <div className="modal" onClick={closeStaffModal}>
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="staff-form-title" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '95%', padding: '20px' }}>
            <div className="flex-between mb-4">
              <h2 id="staff-form-title" style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{editingStaff ? 'Edit Staff Profile' : 'New Staff Registration'}</h2>
              <button className="btn btn-icon btn-secondary" aria-label="Close staff form" onClick={closeStaffModal}><X size={18} /></button>
            </div>

            <form className="staff-edit-form" onSubmit={handleSave} style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                
                {/* Photo Section */}
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-page)', padding: '12px', borderRadius: '12px', marginBottom: '4px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent-glow)', border: '2px solid var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                    {form.photo ? <img src={form.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={24} style={{ margin: '14px', color: 'var(--accent)' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => photoRef.current.click()}>Upload Photo</button>
                    <input type="file" accept="image/*" ref={photoRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
                  </div>
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Full Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toUpperCase() })} required style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Staff ID (System)</label>
                  <input type="text" value={form.id || ''} readOnly style={{ padding: '10px', background: 'var(--bg-card)', opacity: 0.6 }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Employee Number *</label>
                  <input type="text" value={form.employeeNumber || ''} onChange={e => setForm({ ...form, employeeNumber: e.target.value.toUpperCase() })} required placeholder="EMP-001" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Role *</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ padding: '10px' }}>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Employment Status</label>
                  <select value={form.status || 'ACTIVE'} onChange={e => setForm({ ...form, status: e.target.value })} style={{ padding: '10px' }}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ON LEAVE">ON LEAVE</option>
                    <option value="RESIGNED">RESIGNED</option>
                    <option value="PROBATION">PROBATION</option>
                  </select>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Employment Date</label>
                  <input type="date" value={form.employedDate || ''} onChange={e => setForm({ ...form, employedDate: e.target.value })} style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Gender</label>
                  <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} style={{ padding: '10px' }}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Position / Designation</label>
                  <input type="text" value={form.position || ''} onChange={e => setForm({ ...form, position: e.target.value.toUpperCase() })} placeholder="e.g. SENIOR TEACHER" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Qualification</label>
                  <input type="text" value={form.qualification || ''} onChange={e => setForm({ ...form, qualification: e.target.value.toUpperCase() })} placeholder="e.g. B.ED MATHEMATICS" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Assigned Departments (Comma separated)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Preschool, JHS" 
                    value={form.department || ''} 
                    onChange={e => setForm({ ...form, department: e.target.value })} 
                    style={{ padding: '10px' }} 
                  />
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {['Preschool', 'Lower Primary', 'Upper Primary', 'JHS'].map(d => (
                      <button 
                        key={d} type="button" 
                        onClick={() => {
                          const current = (form.department || '').split(',').map(x => x.trim()).filter(Boolean);
                          const next = current.includes(d) ? current.filter(x => x !== d) : [...current, d];
                          setForm({...form, department: next.join(', ')});
                        }}
                        className={`text-[9px] font-bold px-2 py-1 rounded-full border ${ (form.department || '').includes(d) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-400' }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Assigned Subjects (Multi-select)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Mathematics, Science" 
                    value={form.subject || ''} 
                    onChange={e => setForm({ ...form, subject: e.target.value })} 
                    style={{ padding: '10px' }} 
                  />
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {['English', 'Mathematics', 'Science', 'Social Studies', 'ICT', 'Creative Arts', 'French', 'Ghanaian Language', 'RME', 'Physical Education'].map(s => (
                      <button 
                        key={s} type="button" 
                        onClick={() => {
                          const current = (form.subject || '').split(',').map(x => x.trim()).filter(Boolean);
                          const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
                          setForm({...form, subject: next.join(', ')});
                        }}
                        className={`text-[9px] font-bold px-2 py-1 rounded-full border ${ (form.subject || '').includes(s) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-400' }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Contact *</label>
                  <input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} required style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Primary Assigned Class</label>
                  <select value={form.assignedClass} onChange={e => setForm({ ...form, assignedClass: e.target.value })} style={{ padding: '10px' }}>
                    <option value="">None / Admin</option>
                    {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div style={{ width: '100%', fontSize: '10px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em', marginTop: '8px' }}>FINANCIAL STRUCTURE</div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Base Salary</label>
                  <input type="number" value={form.grossSalary || form.salary} onChange={e => setForm({ ...form, grossSalary: e.target.value })} step="0.01" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Allowances</label>
                  <input type="number" value={form.allowance} onChange={e => setForm({ ...form, allowance: e.target.value })} step="0.01" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Employee SSNIT (%)</label>
                  <input type="number" value={form.employeeSsnitPercent} onChange={e => setForm({ ...form, employeeSsnitPercent: e.target.value })} step="0.1" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Bank Name</label>
                  <input type="text" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value.toUpperCase() })} placeholder="e.g. GCB" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7 }}>Account Number</label>
                  <input type="text" value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} placeholder="1234567..." style={{ padding: '10px' }} />
                </div>

                <div style={{ width: '100%', fontSize: '10px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em', marginTop: '8px' }}>DOCUMENT REMINDERS</div>
                {(form.documents || []).map((doc, i) => <div key={doc.id || i} style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 150px 32px', gap: 8 }}>
                  <input aria-label="Document name" placeholder="Document name" value={doc.name || ''} onChange={e => setForm(p => ({ ...p, documents: p.documents.map((d, x) => x === i ? { ...d, name: e.target.value } : d) }))} />
                  <input aria-label="Expiry date" type="date" value={doc.expiryDate || ''} onChange={e => setForm(p => ({ ...p, documents: p.documents.map((d, x) => x === i ? { ...d, expiryDate: e.target.value } : d) }))} />
                  <button type="button" className="btn btn-icon btn-secondary" aria-label="Remove document" onClick={() => setForm(p => ({ ...p, documents: p.documents.filter((_, x) => x !== i) }))}><X size={14} /></button>
                </div>)}
                <button type="button" className="btn btn-secondary" onClick={() => setForm(p => ({ ...p, documents: [...(p.documents || []), { id: `doc-${Date.now()}`, name: '', expiryDate: '' }] }))}>Add Document</button>

              </div>

              <div className="flex gap-3" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={closeStaffModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px' }}>{editingStaff ? 'UPDATE PROFILE' : 'REGISTER STAFF'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
