import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import {
  Users, User, LayoutDashboard, Wallet, FileText, Trash2,
  Search, Sun, Moon, Plus, Download, Printer,
  Trash, RotateCcw, Filter, SortAsc, MoreVertical,
  CheckCircle, XCircle, AlertCircle, TrendingUp, LogOut,
  Upload, ShieldCheck, Layout, ClipboardEdit, ArrowLeft, Settings, X,
  Utensils, TrendingDown, Activity, Bus, Palette, Award, Brain, Briefcase,
  ReceiptText, CalendarDays, ArrowUpRight, LogIn, UserPlus, Banknote, Archive,
  Menu, Bell, ClipboardPaste, FileSpreadsheet, ScrollText, School, LockKeyhole,
  Clock3, Pencil, Lightbulb, AlertTriangle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createUUID, dbOperations } from './services/db';
import { syncService } from './services/syncService';
import { isDateInPeriod } from './utils/date';

import Login from './Login';
import StudentProfile from './StudentProfile';
import DashboardChart from './DashboardChart';
import SyncManager from './components/SyncManager';
import { useBranding } from './context/BrandingContext';
import { useFeedback } from './context/FeedbackContext';
import StudentRegisterModal from './components/StudentRegisterModal';
import Pagination from './components/ui/Pagination';
import usePagination from './hooks/usePagination';

const Payments = lazy(() => import('./pages/Payments'));
const Staff = lazy(() => import('./pages/Staff'));
const Attendance = lazy(() => import('./pages/Attendance'));
const ReportEditor = lazy(() => import('./components/ReportEditor'));
const Expenditure = lazy(() => import('./pages/Expenditure'));
const Feeding = lazy(() => import('./pages/Feeding'));
const StaffWorkspace = lazy(() => import('./pages/StaffWorkspace'));
const BrandingSettings = lazy(() => import('./pages/BrandingSettings'));
const Transport = lazy(() => import('./pages/Transport'));
const ReportTemplateSettings = lazy(() => import('./pages/ReportTemplateSettings'));
const AccessManagementExtras = lazy(() => import('./pages/AccessManagementExtras'));

const FEE_CONFIG = {
  'CRECHE': 680,
  'NURSERY': 680,
  'KINDERGARTEN': 680,
  'BASIC 1': 700,
  'BASIC 2': 700,
  'BASIC 3': 700,
  'BASIC 4': 720,
  'BASIC 5': 720,
  'BASIC 6': 720,
  'BASIC 6 A': 720,
  'BASIC 6 B': 720,
  'B6B': 720,
  'BASIC 7': 900,
  'BASIC 8': 900,
  'BASIC 9': 900,
  'JHS': 900
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error("Error caught:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '16px', margin: '20px', border: '1px solid var(--glass-border)' }}>
          <h2 style={{ color: 'var(--danger)' }}>Something went wrong.</h2>
          <p style={{ color: 'var(--text-main)', margin: '15px 0' }}>The {this.props.name || 'component'} failed to load. Please try refreshing.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Refresh Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- RBAC HELPERS & ROUTE GUARD ---
const ROLE_PERMISSIONS = {
  ADMIN: ['dashboard', 'students', 'payments', 'reports', 'attendance', 'staff', 'settings', 'trash', 'access', 'analytics'],
  ACCOUNTANT: ['dashboard', 'students', 'payments', 'staff', 'reports'],
  TEACHER: ['dashboard', 'students', 'reports', 'attendance'],
};

export const canAccess = (role, page) => {
  const allowed = ROLE_PERMISSIONS[(role || '').toUpperCase()] || [];
  return allowed.includes((page || '').toLowerCase());
};

export const canEdit = (role, resource) => {
  if (!role) return false;
  const r = role.toUpperCase();
  if (r === 'ADMIN') return true;
  // Accountants can record payments but cannot add/edit/delete students
  if (r === 'ACCOUNTANT') return ['payments'].includes(resource);
  // Teachers can fill reports and manage attendance
  if (r === 'TEACHER') return ['reports', 'attendance'].includes(resource);
  return false;
};

function ProtectedRoute({ children, allowedRoles, userRole }) {
  if (!allowedRoles || allowedRoles.map(r => r.toUpperCase()).includes((userRole || '').toUpperCase())) return children;
  return <Navigate to="/access-denied" replace />;
}

// --- CONFIG & CONSTANTS ---
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '/api').replace(/\/+$/, '');
const CONFIG = {
  schoolName: "School ERP",
  termFee: 1000,
  academicYear: "2024/2025",
  term: "TERM 1",
  backendUrl: BACKEND_URL,
  smsUrl: `${BACKEND_URL}/send-sms`,
  uploadUrl: `${BACKEND_URL}/upload`
};

  // allClasses constant is now handled dynamically via state

const safeParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    if (!item || item === 'undefined') return fallback;
    return JSON.parse(item);
  } catch (e) {
    return fallback;
  }
};

export default function App() {
  const { branding } = useBranding();
  const feedback = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const [networkStatus, setNetworkStatus] = useState('online');
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataNotice, setDataNotice] = useState(null);
  const [isMobileNav, setIsMobileNav] = useState(() => window.matchMedia('(max-width: 1024px)').matches);

  useEffect(() => {
    return syncService.addListener((status, syncing) => {
      setNetworkStatus(status);
      setIsSyncing(syncing);
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const update = () => setIsMobileNav(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // --- STATE ---
  const [user, setUser] = useState(safeParse('erp_active_user', null));
  const [token, setToken] = useState(localStorage.getItem('erp_token') || null);
  const [reportTemplates, setReportTemplates] = useState([]);
  const [departments, setDepartments] = useState(() => {
    const DEFAULT = {
      "PRESCHOOL I": ["CRECHE", "NURSERY 1", "NURSERY ONE", "NURSERY 1A", "NURSERY 1B"],
      "PRESCHOOL II": ["NURSERY 2", "NURSERY TWO", "NURSERY 2A", "NURSERY 2B", "KG 1A", "KG 1B", "KG 2A", "KG 2B", "KINDERGARTEN 1", "KINDERGARTEN 2", "KINDERGARTEN", "KINDERGATERN"],
      "LOWER PRIMARY": ["BASIC 1", "BASIC 2", "BASIC 3"],
      "UPPER PRIMARY": ["BASIC 4", "BASIC 5", "BASIC 6"],
      "JHS": ["BASIC 7", "BASIC 8", "BASIC 9"]
    };
    const saved = safeParse('erp_departments', null);
    if (!saved || Object.keys(saved).length === 0) return DEFAULT;

    // Aggressive migration: ensure PRESCHOOL is gone, and I & II exist
    if (saved["PRESCHOOL"] || !saved["PRESCHOOL I"] || !saved["PRESCHOOL II"]) {
      const migrated = { ...saved };
      delete migrated["PRESCHOOL"]; // Destroy the old consolidated department
      if (!migrated["PRESCHOOL I"]) migrated["PRESCHOOL I"] = DEFAULT["PRESCHOOL I"];
      if (!migrated["PRESCHOOL II"]) migrated["PRESCHOOL II"] = DEFAULT["PRESCHOOL II"];
      localStorage.setItem('erp_departments', JSON.stringify(migrated));
      return migrated;
    }
    return saved;
  });

  // ── AGGRESSIVE DEPARTMENT STATE ENFORCER ──
  // The backend might send the old "PRESCHOOL" object or an empty {} (new schools),
  // wiping out our local migration. This enforces all 5 cats.
  const DEFAULT_DEPTS = {
    "PRESCHOOL I": ["CRECHE", "NURSERY 1", "NURSERY ONE", "NURSERY 1A", "NURSERY 1B"],
    "PRESCHOOL II": ["NURSERY 2", "NURSERY TWO", "NURSERY 2A", "NURSERY 2B", "KG 1A", "KG 1B", "KG 2A", "KG 2B", "KINDERGARTEN 1", "KINDERGARTEN 2", "KINDERGARTEN", "KINDERGATERN"],
    "LOWER PRIMARY": ["BASIC 1", "BASIC 2", "BASIC 3"],
    "UPPER PRIMARY": ["BASIC 4", "BASIC 5", "BASIC 6"],
    "JHS": ["BASIC 7", "BASIC 8", "BASIC 9"]
  };
  useEffect(() => {
    const needsFix = departments["PRESCHOOL"] || !departments["PRESCHOOL I"] || !departments["PRESCHOOL II"] || !departments["LOWER PRIMARY"] || !departments["UPPER PRIMARY"] || !departments["JHS"];
    if (needsFix) {
      const migrated = { ...DEFAULT_DEPTS, ...departments };
      delete migrated["PRESCHOOL"];
      if (!migrated["PRESCHOOL I"]) migrated["PRESCHOOL I"] = DEFAULT_DEPTS["PRESCHOOL I"];
      if (!migrated["PRESCHOOL II"]) migrated["PRESCHOOL II"] = DEFAULT_DEPTS["PRESCHOOL II"];
      if (!migrated["LOWER PRIMARY"]) migrated["LOWER PRIMARY"] = DEFAULT_DEPTS["LOWER PRIMARY"];
      if (!migrated["UPPER PRIMARY"]) migrated["UPPER PRIMARY"] = DEFAULT_DEPTS["UPPER PRIMARY"];
      if (!migrated["JHS"]) migrated["JHS"] = DEFAULT_DEPTS["JHS"];
      setDepartments(migrated);
      localStorage.setItem('erp_departments', JSON.stringify(migrated));
    }
  }, [departments]);

  const [studentReports, setStudentReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null); // { student, template, reportData }
  const [activeView, setActiveView] = useState('dashboard');
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');
  const [expenditures, setExpenditures] = useState(safeParse('erp_expenditures', []));
  const [staffAttendance, setStaffAttendance] = useState([]);
  const [staffQuestions, setStaffQuestions] = useState([]);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [staffAwards, setStaffAwards] = useState([]);
  const [staffDisciplinary, setStaffDisciplinary] = useState([]);
  const [staffTasks, setStaffTasks] = useState([]);
  const [transportRoutes, setTransportRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [transportEnrollments, setTransportEnrollments] = useState([]);
  const [transportInvoices, setTransportInvoices] = useState([]);
  const [transportMaintenance, setTransportMaintenance] = useState([]);
  const [feedingConfig, setFeedingConfig] = useState(safeParse('erp_feeding_config', {}));
  const [feedingRecords, setFeedingRecords] = useState(safeParse('erp_feeding_records', []));

  // Update activeView based on URL and enforce role restrictions
  useEffect(() => {
    let path = location.pathname.replace('/', '') || 'dashboard';
    if (user) {
      const role = (user?.role || '').toUpperCase();
      if (role === 'ACCOUNTANT') {
        // Accountants can access: dashboard, students, payments, staff, feeding, expenditure, staff-workspace
        const allowedViews = ['dashboard', 'students', 'payments', 'staff', 'profile', 'access-denied', 'feeding', 'expenditure', 'staff-workspace'];
        if (!allowedViews.some(v => path.startsWith(v))) {
          path = 'dashboard';
          navigate('/dashboard');
        }
      } else if (role === 'TEACHER') {
        // Teachers can access: dashboard, students, attendance, reports, staff-workspace
        const allowedViews = ['dashboard', 'students', 'attendance', 'reports', 'edit-report', 'profile', 'access-denied', 'staff-workspace'];
        if (!allowedViews.some(v => path.startsWith(v))) {
          path = 'dashboard';
          navigate('/dashboard');
        }
      }
    }
    setActiveView(path);
  }, [location, user, navigate]);

  const hasLoaded = React.useRef(false);
  const loadDataRef = React.useRef(null);
  const [feeConfig, setFeeConfig] = useState(FEE_CONFIG);
  const [schoolInfo, setSchoolInfo] = useState(() => {
    const cached = localStorage.getItem('erp_branding_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Force update if it's the old 'Template' or generic name
        if (parsed.schoolName?.includes('TEMPLATE') || parsed.schoolName === 'School ERP') {
          return { ...CONFIG, schoolName: branding.schoolName };
        }
        return { ...CONFIG, ...parsed };
      }
      catch (e) { return { ...CONFIG }; }
    }
    return { ...CONFIG };
  });

  // Aggressive sync: ensure the cache never stays stuck on 'Template'
  useEffect(() => {
    if (schoolInfo.schoolName?.includes('TEMPLATE')) {
      const updated = { ...schoolInfo, schoolName: branding.schoolName };
      setSchoolInfo(updated);
      localStorage.setItem('erp_branding_cache', JSON.stringify(updated));
    }
  }, [schoolInfo]);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const fallbackClasses = [
    'CRECHE', 'NURSERY 1A', 'NURSERY 1B', 'NURSERY 2A', 'NURSERY 2B',
    'KG1A', 'KG1B', 'KG2A', 'KG2B',
    'BASIC 1A', 'BASIC 1B', 'BASIC 2A', 'BASIC 2B',
    'BASIC 3', 'BASIC 4', 'BASIC 5', 'BASIC 6',
    'BASIC 7', 'BASIC 8', 'BASIC 9'
  ];

  const [allClasses, setAllClasses] = useState(() => {
    const parsed = safeParse('erp_all_classes', fallbackClasses);
    // If the array collapsed to one long joined string, split it back out
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string' && parsed[0].length > 30) {
      const byNewline = parsed[0].split('\n').map(s => s.trim()).filter(Boolean);
      const byComma = parsed[0].split(',').map(s => s.trim()).filter(Boolean);
      return byNewline.length > 1 ? byNewline : byComma.length > 1 ? byComma : fallbackClasses;
    }
    return Array.isArray(parsed) ? parsed : fallbackClasses;
  });

  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [localClassesText, setLocalClassesText] = useState(allClasses.join('\n'));
  const [printColored, setPrintColored] = useState(true);

  const isEditingClasses = React.useRef(false);
  const isEditingFeeConfig = React.useRef(false);
  const isEditingFeedingConfig = React.useRef(false);

  useEffect(() => {
    if (!isEditingClasses.current) {
      setLocalClassesText((allClasses || []).join('\n'));
    }
  }, [allClasses]);

  const getTermFee = (className) => {
    const cls = (className || '').toUpperCase();
    for (const [key, fee] of Object.entries(feeConfig)) {
      if (cls.includes(key)) return fee;
    }
    return 1000; // Default fallback
  };

  const calculateStudentFees = (student) => {
    if (!student) return { currentFee: 0, totalDue: 0, originalFee: 0, prevArrears: 0 };
    const originalFee = getTermFee(student.class);
    let currentFee = originalFee;
    let totalDue = 0;

    if (student.discountType === 'full') {
      currentFee = 0;
      totalDue = 0;
    } else if (student.discountType === 'partial') {
      currentFee = Math.max(0, originalFee - (parseFloat(student.discountValue) || 0));
      totalDue = currentFee + (parseFloat(student.prevArrears) || 0);
    } else {
      currentFee = originalFee;
      totalDue = currentFee + (parseFloat(student.prevArrears) || 0);
    }

    // Add Transport Fee if enrolled
    const enrollment = transportEnrollments.find(e => e.studentId === student.id && e.status === 'active');
    if (enrollment) {
      const route = transportRoutes.find(r => r.id === enrollment.routeId);
      if (route) {
        totalDue += parseFloat(route.fee) || 0;
      }
    }

    return {
      originalFee,
      currentFee,
      totalDue,
      prevArrears: parseFloat(student.prevArrears) || 0
    };
  };

  const generateStudentID = (className, offset = 0) => {
    const levels = [
      'CRECHE', 'NURSERY 1', 'NURSERY 2', 'KINDERGARTEN 1', 'KINDERGARTEN 2',
      'BASIC 1', 'BASIC 2', 'BASIC 3', 'BASIC 4', 'BASIC 5', 'BASIC 6',
      'BASIC 7', 'BASIC 8', 'BASIC 9'
    ];

    const clsUpper = (className || '').toUpperCase();
    let currentIndex = levels.findIndex(l => clsUpper.startsWith(l));
    if (currentIndex === -1) currentIndex = 0;

    const yearsRemaining = (levels.length - 1) - currentIndex;
    const currentYearStr = (schoolInfo.academicYear || '').split('/')[1] || new Date().getFullYear().toString();
    const completionYear = parseInt(currentYearStr) + yearsRemaining;

    const studentsInYear = (students || []).filter(s => s && s.sid && s.sid.startsWith(completionYear.toString())).length;
    const nextNum = (studentsInYear + 1 + offset).toString().padStart(3, '0');

    return `${completionYear}-STU${nextNum}`;
  };
  const [theme, setTheme] = useState(localStorage.getItem('erp_theme') || 'light');
  const [currencyCode, setCurrencyCode] = useState(localStorage.getItem('erp_currency_code') || 'GHS');
  const [exchangeRates, setExchangeRates] = useState({ GHS: 1 });

  const CURRENCY_SYMBOLS = {
    GHS: '₵', USD: '$', EUR: '€', GBP: '£', NGN: '₦',
    CAD: 'C$', AUD: 'A$', JPY: '¥', CNY: '元'
  };

  const convertAmount = (amount) => {
    const rate = exchangeRates[currencyCode] || 1;
    return (parseFloat(amount) || 0) * rate;
  };

  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;


  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/GHS');
        const data = await res.json();
        if (data && data.rates) {
          setExchangeRates(data.rates);
        }
      } catch (e) {
        console.error("Failed to fetch exchange rates", e);
      }
    };
    fetchRates();
  }, []);

  useEffect(() => {
    localStorage.setItem('erp_currency_code', currencyCode);
  }, [currencyCode]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen || !isMobileNav) return;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen, isMobileNav]);

  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reports, setReports] = useState([]);
  const [loadingReportId, setLoadingReportId] = useState(null);

  const filteredStudents = useMemo(() => {
    const sList = Array.isArray(students) ? students : [];
    // ADMIN and ACCOUNTANT see ALL students
    if (!user || user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') return sList;
    // TEACHER: only their assigned class
    const assigned = (user.assignedClass || '').toUpperCase().trim();
    if (!assigned) return sList; // if no class assigned, show all
    return sList.filter(s => (s.class || '').toUpperCase().trim() === assigned);
  }, [students, user]);

  const filteredPayments = useMemo(() => {
    const pList = Array.isArray(payments) ? payments : [];
    // ADMIN and ACCOUNTANT see ALL payments
    if (!user || user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') return pList;
    // TEACHER: only payments for students in their assigned class
    const assigned = (user.assignedClass || '').toUpperCase().trim();
    if (!assigned) return pList;
    const classStudentSids = new Set(
      (Array.isArray(students) ? students : [])
        .filter(s => (s.class || '').toUpperCase().trim() === assigned)
        .map(s => s.sid)
    );
    return pList.filter(p => classStudentSids.has(p.studentSid));
  }, [payments, students, user]);

  const filteredReports = useMemo(() => {
    const rList = Array.isArray(reports) ? reports : [];
    // ADMIN and ACCOUNTANT see ALL reports
    if (!user || user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') return rList;
    // TEACHER: only reports for their assigned class
    const assigned = (user.assignedClass || '').toUpperCase().trim();
    if (!assigned) return rList;
    return rList.filter(r => (r.studentClass || '').toUpperCase().trim() === assigned);
  }, [reports, user]);

  const [deleted, setDeleted] = useState([]);
  const [users, setUsers] = useState(safeParse('erp_users', []));
  const [staff, setStaff] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [settings, setSettings] = useState({
    logoUrl: '',
    backgroundUrl: '',
    accountantSignatureUrl: '',
    sigWidth: 120,
    sigHeight: 45,
    preschoolHeadSignatureUrl: '',
    preschoolHeadSigWidth: 120,
    preschoolHeadSigHeight: 45,
    schoolStartTime: '08:00'
  });

  const [studentFilter, setStudentFilter] = useState('');
  const [arrearsFilter, setArrearsFilter] = useState('all');
  const [studentSort, setStudentSort] = useState('name');
  const [genderFilter, setGenderFilter] = useState('all');
  const [trashCategory, setTrashCategory] = useState('STUDENT');
  const [printCount, setPrintCount] = useState(parseInt(localStorage.getItem('erp_print_count')) || 0);
  const [lastPrintDate, setLastPrintDate] = useState(localStorage.getItem('erp_last_print_date') || '');

  const visibleReportStudents = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return (Array.isArray(filteredStudents) ? filteredStudents : [])
      .filter(student => {
        const matchesSearch = !query || (student.name || '').toLowerCase().includes(query) || (student.sid || '').toLowerCase().includes(query);
        const matchesClass = !studentFilter || student.class === studentFilter;
        return matchesSearch && matchesClass;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filteredStudents, searchQuery, studentFilter]);

  const completedVisibleReportCount = useMemo(() => {
    const completedIds = new Set((filteredReports || [])
      .filter(report => (!schoolInfo.term || !report.term || report.term === schoolInfo.term) &&
        (!schoolInfo.academicYear || !report.academicYear || report.academicYear === schoolInfo.academicYear))
      .map(report => report.studentId || report.studentSid));
    return visibleReportStudents.filter(student => completedIds.has(student.id) || completedIds.has(student.sid)).length;
  }, [filteredReports, visibleReportStudents, schoolInfo.term, schoolInfo.academicYear]);

  const visibleReportRecordCount = useMemo(() => {
    const studentIds = new Set(visibleReportStudents.flatMap(student => [student.id, student.sid, student.name]).filter(Boolean));
    return (filteredReports || []).filter(report => studentIds.has(report.studentId) || studentIds.has(report.studentSid) || studentIds.has(report.studentName)).length;
  }, [filteredReports, visibleReportStudents]);

  const getPaymentDate = (val) => {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    // Handles both YYYY-MM-DD and locale strings if any old ones exist
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;

    // Fallback for DD/MM/YYYY
    if (typeof val === 'string') {
      const parts = val.split('/');
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date();
  };

  // --- MODALS ---
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStudent, setPaymentStudent] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [pendingActivationUser, setPendingActivationUser] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderNote, setReminderNote] = useState(
    localStorage.getItem('erp_reminder_note') ||
    'Dear Parent, this is a reminder regarding your child\'s outstanding fees at TRUE STAR ACADEMY. Please kindly settle the balance at your earliest convenience.'
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [receiptPaperSize, setReceiptPaperSize] = useState('A5');
  const [attendance, setAttendance] = useState({});
  const [paymentDateFilter, setPaymentDateFilter] = useState('all');
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [bulkOrientation, setBulkOrientation] = useState('portrait');
  const [bulkLayout, setBulkLayout] = useState('auto');

  // --- BACKEND SYNC ---
  const createRequestId = () => createUUID();

  const getOfflineScope = (tenantId) => ({
    tenantId,
    userId: user?.id || user?._id || user?.email || user?.username
  });

  const getCachedTenantRecords = async (tenantId, collection) => {
    const scope = getOfflineScope(tenantId);
    if (scope.tenantId && scope.userId && typeof dbOperations.getTenantRecords === 'function') {
      return dbOperations.getTenantRecords(collection, scope);
    }
    return dbOperations.getAll(collection);
  };

  const replaceCachedTenantSnapshot = async (tenantId, snapshot) => {
    const scope = getOfflineScope(tenantId);
    if (scope.tenantId && scope.userId && typeof dbOperations.replaceTenantSnapshot === 'function') {
      await Promise.all(Object.entries(snapshot).map(([collection, items]) =>
        dbOperations.replaceTenantSnapshot(collection, items, scope)
      ));
      return;
    }
    await Promise.all(Object.keys(snapshot).map(collection => dbOperations.clear(collection)));
    await Promise.all(Object.entries(snapshot).map(([collection, items]) => dbOperations.putAll(collection, items)));
  };

  const clearCachedTenantData = async (tenantId) => {
    const scope = getOfflineScope(tenantId);
    if (scope.tenantId && scope.userId && typeof dbOperations.clearTenantData === 'function') {
      return dbOperations.clearTenantData(scope);
    }
    if (scope.tenantId && scope.userId && typeof dbOperations.clearTenantCaches === 'function') {
      return dbOperations.clearTenantCaches(scope, ['students', 'payments', 'reports']);
    }
    await Promise.all(['students', 'payments', 'reports'].map(collection => dbOperations.clear(collection, scope)));
  };

  const mergeArrays = (localArr, backendArr, key = 'id') => {
    const map = new Map();
    const normalize = (k, v) => (k === 'email' && v) ? v.toLowerCase().trim() : v;

    (Array.isArray(localArr) ? localArr : []).forEach(item => {
      if (item && item[key]) map.set(normalize(key, item[key]), item);
    });
    (Array.isArray(backendArr) ? backendArr : []).forEach(item => {
      if (item && item[key]) map.set(normalize(key, item[key]), item);
    });
    return Array.from(map.values());
  };

  // ── One-time startup cleanup ────────────────────────────────────────────────
  // Runs once on mount. Strips base64-encoded images embedded in the cached
  // erp_reports localStorage key. These accumulate over time and quickly exceed
  // the browser's 5-10 MB quota, causing a hard crash on the next write.
  useEffect(() => {
    const CLEANUP_VERSION = 'erp_storage_cleanup_v2';
    if (!localStorage.getItem(CLEANUP_VERSION)) {
      try {
        const raw = localStorage.getItem('erp_reports');
        if (raw) {
          const reports = JSON.parse(raw);
          if (Array.isArray(reports)) {
            const isBase64 = (v) => typeof v === 'string' && v.startsWith('data:');
            const cleaned = reports.map(r => {
              if (!r) return r;
              const result = { ...r };
              if (result.localSettings) {
                const s = { ...result.localSettings };
                ['logoUrl', 'signatureUrl', 'kidsGraphicUrl', 'headSignatureUrl', 'preschoolHeadSignatureUrl']
                  .forEach(k => { if (isBase64(s[k])) s[k] = ''; });
                result.localSettings = s;
              }
              if (result.meta?.headSignature && isBase64(result.meta.headSignature)) {
                result.meta = { ...result.meta, headSignature: '' };
              }
              return result;
            });
            localStorage.setItem('erp_reports', JSON.stringify(cleaned));
          }
        }
        // Also clear any other oversized image-only keys
        ['erp_report_logo', 'erp_report_kidsGraphic', 'erp_report_signature'].forEach(k => {
          const v = localStorage.getItem(k);
          if (v && v.startsWith('data:') && v.length > 200000) {
            localStorage.removeItem(k); // Remove if > ~150KB base64
          }
        });
        localStorage.setItem(CLEANUP_VERSION, '1');
        console.log('[Storage] One-time cleanup complete. Quota freed.');
      } catch (e) {
        // If even the cleanup fails (storage already locked), clear the whole reports cache
        console.warn('[Storage] Cleanup failed, clearing erp_reports entirely.', e);
        localStorage.removeItem('erp_reports');
        localStorage.setItem(CLEANUP_VERSION, '1');
      }
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 5000);

    const verifySession = async (existingToken) => {
      try {
        const res = await fetch(`${CONFIG.backendUrl}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${existingToken}` }
        });
        if (res.status === 401 || res.status === 403) {
          await handleLogout();
          return false;
        }
        if (!res.ok) throw new Error(`Session service unavailable (${res.status})`);
        const data = await res.json();
        if (data.success && data.user) {
          syncService.reportBackendReachable(true);
          setUser(data.user);
          localStorage.setItem('erp_active_user', JSON.stringify(data.user));
          if (data.schoolInfo) {
            setSchoolInfo(data.schoolInfo);
            localStorage.setItem('erp_branding_cache', JSON.stringify(data.schoolInfo));
          }
          if (data.branding) {
            // Update branding context/state if needed
          }
          return true;
        }
        await handleLogout();
        return false;
      } catch (e) {
        console.error("Session verification failed", e);
        if (user && existingToken) {
          syncService.reportBackendReachable(false);
          setDataNotice({ type: 'warning', message: 'Connection unavailable. Showing locally cached data where available.' });
          return true;
        }
        return false;
      }
    };

    const loadData = async (isPolling = false) => {
      if (!isPolling) setIsLoading(true);
      try {
        const res = await fetch(`${CONFIG.backendUrl}/data`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
          handleLogout();
          return;
        }
        if (!res.ok) {
          // Transient server/proxy error — keep current state, never fall back to
          // localStorage (that could surface another tenant's cached data).
          console.warn('loadData: non-OK response', res.status);
          setDataNotice({ type: 'error', message: `School data could not be refreshed (${res.status}). Existing information may be out of date.` });
          if (!isPolling) hasLoaded.current = true;
          return;
        }

        const data = await res.json();
        syncService.reportBackendReachable(true);
        setDataNotice(null);

        // The server is the single source of truth and already scopes everything
        // to this user's school. Replace state directly — do NOT merge with the
        // local cache, or a previous tenant's data could bleed through.
        const normaliseClasses = (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return fallbackClasses;
          if (arr.length === 1 && typeof arr[0] === 'string' && arr[0].length > 30) {
            const byNewline = arr[0].split('\n').map(s => s.trim()).filter(Boolean);
            const byComma = arr[0].split(',').map(s => s.trim()).filter(Boolean);
            return byNewline.length > 1 ? byNewline : byComma.length > 1 ? byComma : fallbackClasses;
          }
          return arr;
        };

        setStudents(data.students || []);
        setPayments(data.payments || []);
        setReports(data.reports || []);
        setDeleted(data.deleted || []);
        setUsers(data.users || []);
        setStaff(data.staff || []);
        setActivityLog(data.activity_log || []);
        setAttendance(data.attendance || {});
        setCurrencyCode(data.currency || 'GHS');
        if (!isEditingFeeConfig.current) setFeeConfig(data.feeConfig || {});
        if (data.schoolInfo) setSchoolInfo(data.schoolInfo);
        setExpenditures(data.expenditures || []);
        setStaffAttendance(data.staffAttendance || []);
        setStaffQuestions(data.staffQuestions || []);
        setLessonNotes(data.lessonNotes || []);
        setStaffAwards(data.staffAwards || []);
        setStaffDisciplinary(data.staffDisciplinary || []);
        setStaffTasks(data.staffTasks || []);
        setTransportRoutes(data.transportRoutes || []);
        setBuses(data.buses || []);
        setDrivers(data.drivers || []);
        setTransportEnrollments(data.studentTransport || []);
        setTransportInvoices(data.transportInvoices || []);
        setTransportMaintenance(data.transportMaintenance || []);
        if (!isEditingFeedingConfig.current) setFeedingConfig(data.feedingConfig || {});
        setFeedingRecords(data.feedingRecords || []);
        setAllClasses(normaliseClasses(data.allClasses));
        setSettings(data.settings || { logoUrl: '', backgroundUrl: '' });
        // Merge backend departments with defaults so new schools (empty {}) still show all 5 cats: PRESCHOOL I/II, LOWER/UPPER PRIMARY, JHS — fixes Select Department showing only 2
        const _DEFAULT = {
          "PRESCHOOL I": ["CRECHE", "NURSERY 1", "NURSERY ONE", "NURSERY 1A", "NURSERY 1B"],
          "PRESCHOOL II": ["NURSERY 2", "NURSERY TWO", "NURSERY 2A", "NURSERY 2B", "KG 1A", "KG 1B", "KG 2A", "KG 2B", "KINDERGARTEN 1", "KINDERGARTEN 2", "KINDERGARTEN", "KINDERGATERN"],
          "LOWER PRIMARY": ["BASIC 1", "BASIC 2", "BASIC 3"],
          "UPPER PRIMARY": ["BASIC 4", "BASIC 5", "BASIC 6"],
          "JHS": ["BASIC 7", "BASIC 8", "BASIC 9"]
        };
        if (data.departments && Object.keys(data.departments).length > 0) {
          setDepartments(prev => ({ ..._DEFAULT, ...data.departments }));
        } else if (!data.departments || Object.keys(data.departments).length === 0) {
          setDepartments(prev => (Object.keys(prev).length >= 5 ? prev : { ..._DEFAULT, ...prev }));
        }
        setReportTemplates(data.reportTemplates || []);

        // Delaying the hasLoaded flag to ensure state updates settle before syncing triggers
        setTimeout(() => { hasLoaded.current = true; }, 1000);

        // Replace, rather than merge, the authenticated tenant's offline snapshot.
        await replaceCachedTenantSnapshot(user?.schoolId, {
          students: data.students || [],
          payments: data.payments || [],
          reports: data.reports || []
        });
        syncService.sync();
      } catch (e) {
        console.error("Backend load failed", e);
        syncService.reportBackendReachable(false);
        const tenantId = user?.schoolId;
        const [cachedStudents, cachedPayments, cachedReports] = await Promise.all([
          getCachedTenantRecords(tenantId, 'students'),
          getCachedTenantRecords(tenantId, 'payments'),
          getCachedTenantRecords(tenantId, 'reports')
        ]);
        if (cachedStudents.length > 0) setStudents(cachedStudents);
        if (cachedPayments.length > 0) setPayments(cachedPayments);
        if (cachedReports.length > 0) setReports(cachedReports);
        setDataNotice({ type: 'warning', message: cachedStudents.length || cachedPayments.length || cachedReports.length
          ? 'Server unavailable. You are viewing cached data; new changes will be queued for sync.'
          : 'Server unavailable and no cached school data was found.' });
        if (!isPolling) hasLoaded.current = true;
      } finally {
        if (!isPolling) setIsLoading(false);
        clearTimeout(timeout);
      }
    };
    loadDataRef.current = loadData;

    if (!hasLoaded.current) {
      const init = async () => {
        if (token) {
          const isValid = await verifySession(token);
          if (isValid) loadData();
        } else {
          setIsLoading(false);
        }
      };
      init();
    }

    // --- ROUTE REHYDRATION ---
    // If we land on /edit-report/... on fresh load, try to hydrate activeReport
    const path = location.pathname;
    if (path.startsWith('/edit-report/')) {
      const id = path.split('/').pop();
      if (id.startsWith('template-')) {
        const d = decodeURIComponent(id.replace('template-', ''));
        setActiveReport({
          student: { class: departments[d]?.[0] || 'NURSERY' },
          template: null,
          reportData: null,
          isTemplateMode: true,
          targetDepartment: d
        });
      } else if (students.length > 0) {
        const student = students.find(s => s.id === id || s.sid === id);
        if (student) {
          // If we have students but activeReport is null, open it
          if (!activeReport) handleOpenReport(student);
        }
      }
    }

    const interval = setInterval(() => {
      if (token) loadData(true);
    }, 10000); // 10s poll for better real-time experience
    return () => {
      clearInterval(interval);
      if (loadDataRef.current === loadData) loadDataRef.current = null;
    };
  }, [token]);

  const syncWithBackend = async (collection, data, type = 'replace', itemId = null, requestId = null) => {
    if (!token) return;
    if (type === 'create') type = 'add';
    const stableRequestId = requestId || createUUID();
    try {
      console.log(`Syncing ${collection} (${type}) ID: ${itemId}`);
      let url = `${CONFIG.backendUrl}/data/${collection}`;
      let method = 'POST';
      let body = data;

      if (type === 'add') {
        url = `${CONFIG.backendUrl}/data/${collection}/add`;
      } else if (type === 'update' && itemId) {
        url = `${CONFIG.backendUrl}/data/${collection}/update/${encodeURIComponent(itemId)}`;
        method = 'POST';
      } else if (type === 'delete' && itemId) {
        if (collection === 'users') {
          url = `${CONFIG.backendUrl}/users/delete/${encodeURIComponent(itemId)}`;
        } else {
          url = `${CONFIG.backendUrl}/data/${collection}/delete/${encodeURIComponent(itemId)}`;
        }
        method = 'DELETE';
        body = null;
      }

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(stableRequestId ? { 'X-Request-ID': stableRequestId } : {}),
          'X-User-Role': user?.role || 'TEACHER',
          'X-Assigned-Class': user?.assignedClass || ''
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!res.ok && res.status !== 401) {
        const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
        if (retryable) throw new Error('Retryable Server Error');
        setDataNotice({ type: 'error', message: `The server rejected a ${collection} change (${res.status}). Review the entry and try again.` });
        return false;
      }

      console.log(`Sync ${collection} response:`, res.status);

      if (res.status === 401 && token !== 'local-session-token' && token !== 'local-signup-token') {
        handleLogout();
      }
      return res.ok;
    } catch (e) {
      console.error(`Sync failed for ${collection} (${type}). Queueing for retry.`, e);
      const networkFailure = e instanceof TypeError || /failed to fetch|load failed|network|fetch/i.test(e.message || '');
      if (navigator.onLine === false || networkFailure || e.message === 'Retryable Server Error') {
        await syncService.queueAction(collection, data, type, itemId, {
          baseUrl: CONFIG.backendUrl,
          tenantId: user?.schoolId,
          userId: user?.id || user?._id || user?.email,
          requestId: stableRequestId,
          headers: {
            ...(stableRequestId ? { 'X-Request-ID': stableRequestId } : {}),
            'X-User-Role': user?.role || 'TEACHER',
            'X-Assigned-Class': user?.assignedClass || ''
          }
        });
        setDataNotice({ type: 'warning', message: 'Change saved locally and queued for synchronization.' });
        return 'queued';
      }
      return false;
    }
  };

  // ── Safe localStorage write: catches QuotaExceededError so a full storage
  //    never crashes the app. For reports, we strip embedded base64 images
  //    (logos, signatures, kidsGraphics) before caching since the backend is
  //    the source of truth for the actual report data.
  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn(`[Storage] Quota exceeded for "${key}". Clearing stale data and retrying.`);
        // Attempt to free space by removing the largest keys first
        try {
          localStorage.removeItem('erp_reports'); // reports is biggest offender
          localStorage.setItem(key, value);
        } catch (_) {
          console.warn(`[Storage] Could not persist "${key}" — storage is permanently full.`);
        }
      } else {
        console.error('[Storage] Unexpected error:', e);
      }
    }
  };

  // Strip base64 images from a report before persisting to localStorage.
  // Images are large and already held by the backend; keeping them in localStorage
  // is the primary cause of QuotaExceededError.
  const stripImagesForCache = (report) => {
    if (!report) return report;
    const isBase64 = (v) => typeof v === 'string' && v.startsWith('data:');
    const stripSettings = (s) => {
      if (!s) return s;
      const cleaned = { ...s };
      ['logoUrl', 'signatureUrl', 'kidsGraphicUrl', 'headSignatureUrl', 'preschoolHeadSignatureUrl'].forEach(k => {
        if (isBase64(cleaned[k])) cleaned[k] = '';
      });
      return cleaned;
    };
    return {
      ...report,
      localSettings: stripSettings(report.localSettings),
      meta: report.meta ? {
        ...report.meta,
        headSignature: isBase64(report.meta.headSignature) ? '' : (report.meta.headSignature || ''),
      } : report.meta,
    };
  };

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_students', JSON.stringify(students));
    }
  }, [students]);

  useEffect(() => {
    if (hasLoaded.current) {
      // Cache only a stripped (image-free) version of reports to avoid quota errors.
      // The authoritative data lives on the backend.
      const cacheable = (reports || []).map(stripImagesForCache);
      safeSetItem('erp_reports', JSON.stringify(cacheable));
    }
  }, [reports]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_payments', JSON.stringify(payments));
    }
  }, [payments]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_expenditures', JSON.stringify(expenditures));
    }
  }, [expenditures]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_feeding_config', JSON.stringify(feedingConfig));
    }
  }, [feedingConfig]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_users', JSON.stringify(users));
      // syncWithBackend('users', users); // Disabled: Dangerous full-replace of global users list.
    }
  }, [users]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_staff', JSON.stringify(staff));
    }
  }, [staff]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_deleted', JSON.stringify(deleted));
    }
  }, [deleted]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_settings', JSON.stringify(settings));
    }
  }, [settings]);

  useEffect(() => {
    safeSetItem('erp_active_user', JSON.stringify(user));
    safeSetItem('erp_token', token || '');
    document.body.setAttribute('data-theme', theme);
    safeSetItem('erp_theme', theme);
  }, [user, token, theme]);

  useEffect(() => {
    // Pre-filter student list to assigned class for Teachers only
    if (user && user?.role === 'TEACHER' && user.assignedClass) {
      setStudentFilter(user.assignedClass);
    } else {
      setStudentFilter('');
    }
  }, [user]);

  // Clear report loading spinner once navigation succeeds
  useEffect(() => { if (activeReport) setLoadingReportId(null); }, [activeReport]);

  // TEACHER dashboard access allowed (restricted to class arrears in the UI)

  // Keep the browser tab meaningful as the user moves between application routes.
  useEffect(() => {
    const routeName = {
      '/': 'Dashboard', '/dashboard': 'Dashboard', '/students': 'Students',
      '/attendance': 'Attendance', '/payments': 'Payments', '/expenditure': 'Expenditure',
      '/feeding': 'Feeding', '/reports': 'Reports', '/staff': 'Staff',
      '/staff-workspace': 'Staff Workspace', '/transport': 'Transport', '/settings': 'Settings',
      '/trash': 'Recycle Bin', '/access': 'System Access', '/access-denied': 'Access Denied',
      '/bulk-print': 'Bulk Print'
    };
    const page = location.pathname.startsWith('/edit-report/') ? 'Report Editor' : (routeName[location.pathname] || 'Portal');
    const name = schoolInfo?.schoolName && schoolInfo.schoolName !== 'School ERP' ? schoolInfo.schoolName : 'Institution Portal';
    document.title = `${page} | ${name}`;
  }, [location.pathname, schoolInfo?.schoolName]);

  useEffect(() => {
    if (hasLoaded.current) {
      safeSetItem('erp_all_classes', JSON.stringify(allClasses));
    }
  }, [allClasses]);

  useEffect(() => {
    if (hasLoaded.current) {
      try { localStorage.setItem('erp_attendance', JSON.stringify(attendance)); } catch(e) { console.warn('[Storage] Could not cache attendance', e); }
    }
  }, [attendance]);

  useEffect(() => {
    if (hasLoaded.current) {
      try { localStorage.setItem('erp_departments', JSON.stringify(departments)); } catch(e) { console.warn('[Storage] Could not cache departments', e); }
    }
  }, [departments]);

  useEffect(() => {
    if (hasLoaded.current) {
      try { localStorage.setItem('erp_report_templates', JSON.stringify(reportTemplates)); } catch(e) { console.warn('[Storage] Could not cache report templates', e); }
    }
  }, [reportTemplates]);

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
    const sList = filteredStudents;
    const pList = filteredPayments;

    const total = sList.length;
    const males = sList.filter(s => s && s.gender === 'M').length;
    const females = sList.filter(s => s && s.gender === 'F').length;

    const revenue = pList.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);

    const expected = sList.reduce((sum, s) => {
      const fees = calculateStudentFees(s);
      return sum + fees.totalDue;
    }, 0);

    const arrears = Math.max(0, expected - revenue);

    const now = new Date();
    const todayStr = now.toLocaleDateString();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const todayPays = pList.filter(p => p && isDateInPeriod(p.date, 'today', now));
    const todayRevenue = todayPays.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);

    const weekPays = pList.filter(p => p && isDateInPeriod(p.date, 'week', now));
    const weekRevenue = weekPays.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);

    const monthPays = pList.filter(p => p && isDateInPeriod(p.date, 'month', now));
    const monthRevenue = monthPays.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);

    const logins = (activityLog || []).filter(a => a && a.type === 'LOGIN');
    const signups = (activityLog || []).filter(a => a && a.type === 'SIGNUP');

    const parseLogDate = (dStr) => {
      if (!dStr) return new Date(0);
      const [datePart] = dStr.split(' ');
      if (!datePart) return new Date(0);
      const [y, m, d] = datePart.split('-');
      if (!y || !m || !d) return new Date(0);
      return new Date(y, m - 1, d);
    };

    const todayLogins = logins.filter(l => parseLogDate(l.time).toLocaleDateString() === todayStr).length;
    const weekLogins = logins.filter(l => parseLogDate(l.time) >= startOfWeek).length;
    const monthLogins = logins.filter(l => parseLogDate(l.time) >= startOfMonth).length;

    const todaySignups = signups.filter(s => parseLogDate(s.time).toLocaleDateString() === todayStr).length;
    const weekSignups = signups.filter(s => parseLogDate(s.time) >= startOfWeek).length;
    const monthSignups = signups.filter(s => parseLogDate(s.time) >= startOfMonth).length;

    const totalExpenses = (expenditures || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    let feedingRevenue = 0;
    Object.entries(attendance || {}).forEach(([date, dayEntry]) => {
      const dayData = dayEntry.records || dayEntry;
      (students || []).forEach(s => {
        if (dayData[s.sid] === 'present') feedingRevenue += (feedingConfig[s.class] || 5);
      });
    });

    return {
      total, males, females, revenue, arrears,
      todayRevenue, todayCount: todayPays.length,
      weekRevenue, weekCount: weekPays.length,
      monthRevenue, monthCount: monthPays.length,
      todayLogins, weekLogins, monthLogins,
      todaySignups, weekSignups, monthSignups,
      expected, totalExpenses, feedingRevenue, netProfit: (revenue + feedingRevenue) - totalExpenses
    };
  }, [students, payments, feeConfig, filteredStudents, filteredPayments, activityLog, expenditures, feedingConfig, attendance]);

  const studentBalances = useMemo(() => {
    const balances = {};
    const paymentTotals = {};

    (Array.isArray(payments) ? payments : []).forEach(p => {
      if (!p || !p.studentSid) return;
      paymentTotals[p.studentSid] = (paymentTotals[p.studentSid] || 0) + (parseFloat(p.amount) || 0);
    });

    (Array.isArray(students) ? students : []).forEach(s => {
      if (!s || !s.sid) return;
      const fees = calculateStudentFees(s);
      const totalExpected = fees.totalDue;
      const paid = paymentTotals[s.sid] || 0;
      balances[s.sid] = {
        totalPaid: paid,
        balance: Math.max(0, totalExpected - paid),
        isArrears: (parseFloat(s.prevArrears) || 0) > 0
      };
    });
    return balances;
  }, [students, payments]);

  const displayStudents = useMemo(() => {
    return filteredStudents
      .filter(s => {
        if (!s) return false;
        const stats = studentBalances[s.sid] || { balance: 0, isArrears: false };
        const balance = stats.balance;

        const matchesArrears =
          arrearsFilter === 'all' ? true :
            arrearsFilter === 'previous' ? stats.isArrears :
              arrearsFilter === 'current' ? (balance > 0) : true;


        const matchesGender = genderFilter === 'all' ? true : s.gender === genderFilter;

        return matchesArrears && matchesGender &&
          (!studentFilter || (s.class || '').trim().toUpperCase() === studentFilter.trim().toUpperCase()) &&
          (!searchQuery ||
            (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.sid || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.class || '').toLowerCase().includes(searchQuery.toLowerCase())
          );

      })
      .sort((a, b) => {
        if (studentSort === 'name') return a.name.localeCompare(b.name);
        if (studentSort === 'sid') return a.sid.localeCompare(b.sid);
        if (studentSort === 'class') return a.class.localeCompare(b.class);
        return 0;
      });
  }, [students, studentBalances, arrearsFilter, genderFilter, studentFilter, searchQuery, studentSort, filteredStudents]);

  const studentPagination = usePagination({ items: displayStudents, initialPageSize: 25 });
  const reportPagination = usePagination({ items: visibleReportStudents, initialPageSize: 25 });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${CONFIG.backendUrl}/auth/check`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(async response => {
      if (!response.ok) return;
      const status = await response.json().catch(() => ({}));
      if (!cancelled && typeof status.smsEnabled === 'boolean') setSmsEnabled(status.smsEnabled);
    }).catch(error => console.warn('SMS status check failed', error));
    return () => { cancelled = true; };
  }, [token]);

  const sendSMS = async (phone, message) => {
    if (!smsEnabled || !phone || !message || !token) return false;
    try {
      const response = await fetch(CONFIG.smsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phone, message })
      });
      if (!response.ok) throw new Error(`SMS service rejected the request (${response.status})`);
      console.log(`SMS Sent to ${phone}: ${message}`);
      return true;
    } catch (e) {
      console.error("SMS failed", e);
      return false;
    }
  };

  const handleImageUpload = async (file, type) => {
    if (!file) return;

    // Signatures stored as base64 — persist to backend settings so report cards can render them (was local-only, so Reports showed OFFICIAL SIGNATURE REQUIRED)
    const SIGNATURE_TYPES = ['accountantSignature', 'headSignature', 'preschoolHeadSignature'];
    if (SIGNATURE_TYPES.includes(type)) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const newUrl = e.target.result;
        // cap 2MB like student photo check to avoid 413 / quota errors
        if (newUrl.length > 2 * 1024 * 1024 * 1.37) {
          alert("Image is too large. Please select a photo under 2MB.");
          return;
        }
        setSettings(prev => {
          const next = { ...prev, [`${type}Url`]: newUrl };
          // sync to per-school settings on backend (schoolId-scoped via backend/server.py:212 SCHOOL_CONFIG_KEYS)
          syncWithBackend('settings', next).catch(err => console.warn("Failed to save signature to backend", err));
          return next;
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    // Logo and background images are uploaded to the backend
    const formData = new FormData();
    formData.append('file', file);

    setIsLoading(true);
    try {
      const res = await fetch(`${CONFIG.uploadUrl}-${type}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setSettings(prev => ({ ...prev, [`${type}Url`]: data.url }));
        alert(`${type === 'logo' ? 'Logo' : 'Background'} updated successfully!`);
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (e) {
      console.error("Upload error", e);
      alert("Error uploading image");
    } finally {
      const fetchExtraData = async () => {
        try {
          const [deptRes, tmpRes] = await Promise.all([
            fetch(`${CONFIG.backendUrl}/departments`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${CONFIG.backendUrl}/report-templates`, { headers: { 'Authorization': `Bearer ${token}` } })
          ]);
          if (deptRes.ok) setDepartments(await deptRes.json());
          if (tmpRes.ok) setReportTemplates(await tmpRes.json());
        } catch (e) { console.error("Error fetching extra data", e); }
        finally { setIsLoading(false); }
      };
      fetchExtraData();
    }
  };

  // --- HANDLERS ---

  // Wipe every per-school cached collection from localStorage. Called on login
  // (before loading the new school) and on logout, so one institution's data
  // can never bleed into another's session on a shared browser.
  const clearTenantCache = () => {
    [
      'erp_students', 'erp_payments', 'erp_reports', 'erp_deleted', 'erp_users',
      'erp_staff', 'erp_activity_log', 'erp_attendance', 'erp_settings',
      'erp_all_classes', 'erp_departments', 'erp_report_templates',
      'erp_expenditures', 'erp_feeding_config', 'erp_feeding_records',
      'erp_fee_config', 'erp_currency_code', 'erp_school_info', 'erp_branding_cache'
    ].forEach(k => localStorage.removeItem(k));
  };

  const resetTenantState = () => {
    setStudents([]);
    setPayments([]);
    setReports([]);
    setDeleted([]);
    setUsers([]);
    setStaff([]);
    setActivityLog([]);
    setAttendance({});
    setExpenditures([]);
    setStaffAttendance([]);
    setStaffQuestions([]);
    setLessonNotes([]);
    setStaffAwards([]);
    setStaffDisciplinary([]);
    setStaffTasks([]);
    setTransportRoutes([]);
    setBuses([]);
    setDrivers([]);
    setTransportEnrollments([]);
    setTransportInvoices([]);
    setTransportMaintenance([]);
    setFeedingConfig({});
    setFeedingRecords([]);
    setFeeConfig(FEE_CONFIG);
    setSchoolInfo({ ...CONFIG, schoolName: branding.schoolName || CONFIG.schoolName });
    setAllClasses(fallbackClasses);
    setDepartments({});
    setReportTemplates([]);
    setSettings({ logoUrl: '', backgroundUrl: '', accountantSignatureUrl: '', sigWidth: 120, sigHeight: 45, preschoolHeadSignatureUrl: '', preschoolHeadSigWidth: 120, preschoolHeadSigHeight: 45, schoolStartTime: '08:00' });
    setActiveReport(null);
    setSelectedProfile(null);
    setSelectedStudentIds([]);
    setStudentReports([]);
    setCurrencyCode('GHS');
    setDataNotice(null);
  };

  const enterApp = async (backendUser, backendToken) => {
    const previousTenantId = user?.schoolId;
    resetTenantState();
    clearTenantCache();
    try {
      await clearCachedTenantData(previousTenantId || null);
    } catch (error) {
      console.warn('Could not clear the previous offline tenant cache', error);
    }
    hasLoaded.current = false;
    setUser(backendUser);
    setToken(backendToken);
    localStorage.setItem('erp_active_user', JSON.stringify(backendUser));
    localStorage.setItem('erp_token', backendToken);
    if (backendUser?.email) localStorage.setItem('erp_last_email', backendUser.email);
    await syncService.handleScopeChange();
  };

  const handleLogin = async (credentials) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${CONFIG.backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json().catch(() => ({}));

      if (data.success && data.token) {
        await enterApp(data.user, data.token);
        if (data.schoolInfo) {
          setSchoolInfo(data.schoolInfo);
          localStorage.setItem('erp_branding_cache', JSON.stringify(data.schoolInfo));
        }
      } else if (res.status === 403) {
        alert(data.error || "Access denied. Please contact your administrator.");
      } else {
        alert(data.error || "Invalid credentials.");
      }
    } catch (e) {
      console.error("Login request failed", e);
      alert("Cannot reach the server. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Staff joining an existing institution via its school code. The server
  // creates them pending_activation; we do NOT log them in.
  const handleSignup = async (userData) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${CONFIG.backendUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create account.');
      }
    } catch (e) {
      throw new Error(e.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
    return { success: true };
  };

  // Register a brand-new institution; the server returns a token + school code.
  // We reveal the code, then log the new admin straight in.
  const handleRegisterInstitution = async (payload) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${CONFIG.backendUrl}/auth/register-institution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to register institution.');
      }
      // We do NOT call enterApp because status is 'pending'
      return data;
    } catch (e) {
      throw new Error(e.message || 'Failed to register institution.');
    } finally {
      setIsLoading(false);
    }
  };


  const handleActivateUser = (u) => {
    console.log("Triggering activation modal for:", u.email);
    setPendingActivationUser(u);
    setShowActivationModal(true);
  };

  const processUserActivation = async (u, newPassword) => {
    const trimmedPw = (newPassword || '').trim();
    if (trimmedPw.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    let didActivate = false;
    try {
      console.log("Sending activation request to backend for:", u.email);
      const res = await fetch(`${CONFIG.backendUrl}/users/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: u.email, newPassword: trimmedPw })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        didActivate = true;
        setUsers(prev => prev.map(usr => {
          if (usr.email === u.email) {
            return { ...usr, password_recovery_requested: false, status: 'active' };
          }
          return usr;
        }));
        alert(`${u.name}'s account has been successfully activated and password reset!`);
      } else {
        throw new Error(data.error || "Backend failed to activate");
      }
    } catch (err) {
      console.warn("Backend activation error", err);
      alert(err.message || "Activation failed. The account was not changed.");
    } finally {
      if (didActivate) {
        setShowActivationModal(false);
        setPendingActivationUser(null);
      }
      if (didActivate) await loadDataRef.current?.(true);
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${CONFIG.backendUrl}/auth/logout-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: user?.email, name: user?.name })
      });
    } catch (e) { console.error('Logout log failed', e); }
    const tenantId = user?.schoolId;
    resetTenantState();
    hasLoaded.current = false;
    try {
      await clearCachedTenantData(tenantId);
    } catch (error) {
      console.warn('Could not clear the offline tenant cache during logout', error);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('erp_active_user');
    localStorage.removeItem('erp_token');
    await syncService.handleScopeChange();
    clearTenantCache();   // drop this school's cached data so the next login starts clean
    window.location.reload();
  };

  const addOrUpdateStudent = async (data) => {
    const studentData = {
      ...data,
      prevArrears: parseFloat(data.prevArrears) || 0,
      discountValue: parseFloat(data.discountValue) || 0,
      discountType: data.discountType || 'none'
    };
    if (editingStudent) {
      const updated = { ...editingStudent, ...studentData };
      const previous = students;
      const updatedList = students.map(s => s.id === editingStudent.id ? updated : s);
      setStudents(updatedList);
      const saved = await syncWithBackend('students', updated, 'update', editingStudent.id);
      if (!saved) {
        setStudents(previous);
        feedback.toast.error('Student changes were not saved.');
        return false;
      }
    } else {
      const studentId = data.sid || generateStudentID(data.class);
      const requestId = createRequestId('student');
      const newStudent = { id: requestId, requestId, ...studentData, sid: studentId };
      setStudents(prev => [...prev, newStudent]);
      const saved = await syncWithBackend('students', newStudent, 'add', null, requestId);
      if (!saved) {
        setStudents(prev => prev.filter(student => student.id !== newStudent.id));
        feedback.toast.error('Student was not added.');
        return false;
      }
    }
    setEditingStudent(null);
    setShowStudentModal(false);
    return true;
  };

  const handleUpdateStudentPhoto = async (id, photoUrl) => {
    const previous = students;
    const updatedStudents = students.map(student => student.id === id ? { ...student, photoUrl } : student);
    setStudents(updatedStudents);
    if (selectedProfile && selectedProfile.id === id) {
      setSelectedProfile(prev => ({ ...prev, photoUrl }));
    }
    const updatedStudent = updatedStudents.find(student => student.id === id);
    const saved = await syncWithBackend('students', updatedStudent, 'update', id);
    if (!saved) {
      setStudents(previous);
      if (selectedProfile?.id === id) setSelectedProfile(previous.find(student => student.id === id) || null);
      feedback.toast.error('Student photo was not saved.');
      return false;
    }
    return true;
  };

  const deleteStudent = async (id) => {
    const student = students.find(x => x.id === id);
    if (!student || !await feedback.confirm({ title: 'Move student to Recycle Bin?', message: `${student.name} (${student.sid}) can be restored during the retention period.`, confirmLabel: 'Move to Recycle Bin' })) return;
    try {
      const response = await fetch(`${CONFIG.backendUrl}/recycle/students/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: 'Removed from student list' }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Student could not be recycled.');
      setDeleted(prev => [...prev, payload.item]);
      setStudents(prev => prev.filter(x => x.id !== id));
      feedback.toast.success({ message: `${student.name} moved to the Recycle Bin.`, action: { label: 'View', onClick: () => navigate('/trash') } });
    } catch (error) { feedback.toast.error(error.message); }
  };

  const restoreDeletedItem = async (item) => {
    try {
      let restoredItem = item.record;
      if (item.originalCollection) {
        const response = await fetch(`${CONFIG.backendUrl}/recycle/${encodeURIComponent(item.id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Item could not be restored.');
        restoredItem = payload.item;
      } else {
        const { type, deletedAt, deleteDate, ...legacyItem } = item;
        restoredItem = legacyItem;
        await syncWithBackend(item.type === 'STUDENT' ? 'students' : 'payments', restoredItem, 'add', null, restoredItem.requestId || restoredItem.id);
      }
      if (item.type === 'STUDENT') setStudents(previous => previous.some(current => current.id === restoredItem.id) ? previous : [...previous, restoredItem]);
      if (item.type === 'PAYMENT') setPayments(previous => previous.some(current => current.id === restoredItem.id) ? previous : [...previous, restoredItem]);
      setDeleted(previous => previous.filter(current => current.id !== item.id));
      return true;
    } catch (error) {
      feedback.toast.error(error.message);
      return false;
    }
  };

  const purgeDeletedItem = async (item) => {
    if (item.originalCollection) {
      const response = await fetch(`${CONFIG.backendUrl}/recycle/${encodeURIComponent(item.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Item could not be permanently deleted.');
    }
    setDeleted(previous => previous.filter(current => current.id !== item.id));
  };

  const saveReportRecord = async (report) => {
    const requestId = report.requestId || createRequestId('report');
    const response = await fetch(`${CONFIG.backendUrl}/save-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Request-ID': requestId
      },
      body: JSON.stringify({ ...report, requestId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Report could not be saved (${response.status}).`);
    return payload.report || { ...report, requestId };
  };

  const recycleReportRecord = async (id) => {
    const response = await fetch(`${CONFIG.backendUrl}/recycle/reports/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reason: 'Removed from reports' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Report could not be removed (${response.status}).`);
    return payload.item;
  };

  const handleUploadReport = async (studentSid, fileData, fileName) => {
    const student = students.find(s => s.sid === studentSid);
    const requestId = createRequestId('report');
    const newReport = {
      id: requestId,
      requestId,
      studentSid,
      studentName: student?.name || 'Unknown',
      studentClass: student?.class || 'N/A',
      fileData,
      fileName,
      addedBy: user?.name || 'Admin',
      date: new Date().toISOString()
    };
    setReports(prev => [...prev, newReport]);
    try {
      const savedReport = await saveReportRecord(newReport);
      setReports(prev => prev.map(report => report.id === newReport.id ? savedReport : report));
      return true;
    } catch (error) {
      setReports(prev => prev.filter(report => report.id !== newReport.id));
      feedback.toast.error(error.message);
      return false;
    }
  };

  const handleDeleteReport = async (id) => {
    if (!confirm("Move this report to the Recycle Bin?")) return false;
    const previous = reports;
    setReports(prev => prev.filter(r => r.id !== id));
    try {
      const recycled = await recycleReportRecord(id);
      if (recycled) setDeleted(prev => [...prev, recycled]);
      return true;
    } catch (error) {
      setReports(previous);
      feedback.toast.error(error.message);
      return false;
    }
  };

  const handleBulkDeleteReports = async () => {
    if (selectedStudentIds.length === 0) return;
    const count = selectedStudentIds.length;
    if (confirm(`Are you sure you want to delete ALL reports for the ${count} selected students? This action cannot be undone.`)) {
      // Find all reports belonging to selected students
      const selectedStudents = students.filter(s => selectedStudentIds.includes(s.id));
      const reportsToDelete = (reports || []).filter(r =>
        selectedStudents.some(s => r.studentId === s.id || (r.studentId === undefined && (r.studentSid === s.sid || r.studentName === s.name)))
      );

      if (reportsToDelete.length === 0) {
        alert("No reports found for the selected students.");
        return;
      }

      // Update local state
      const reportIdsToDelete = reportsToDelete.map(r => r.id);
      setReports(prev => prev.filter(r => !reportIdsToDelete.includes(r.id)));

      const results = await Promise.allSettled(reportIdsToDelete.map(id => recycleReportRecord(id)));
      const failedIds = reportIdsToDelete.filter((id, index) => results[index].status === 'rejected');
      const recycled = results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
      if (failedIds.length) setReports(prev => [...prev, ...reportsToDelete.filter(report => failedIds.includes(report.id))]);
      if (recycled.length) setDeleted(prev => [...prev, ...recycled]);
      setSelectedStudentIds([]);
      const savedCount = reportsToDelete.length - failedIds.length;
      if (failedIds.length) feedback.toast.error(`${savedCount} reports moved to the Recycle Bin; ${failedIds.length} could not be removed.`);
      else feedback.toast.success(`${savedCount} reports moved to the Recycle Bin.`);
    }
  };

  const saveClasses = async (newClasses) => {
    const previous = allClasses;
    try {
      const unique = Array.from(new Set(newClasses.map(c => c.toUpperCase().trim()))).filter(Boolean);
      setAllClasses(unique);
      localStorage.setItem('erp_all_classes', JSON.stringify(unique));
      if (!await syncWithBackend('allClasses', unique)) throw new Error('Classes were not saved.');
      return true;
    } catch (e) {
      setAllClasses(previous);
      feedback.toast.error(e.message || 'Classes were not saved.');
      return false;
    }
  };

  const saveFeedingRecord = async (record) => {
    const updated = [record, ...feedingRecords];
    setFeedingRecords(updated);
    const saved = await syncWithBackend('feedingRecords', record, 'add');
    if (saved === false) {
      setFeedingRecords(feedingRecords);
      return false;
    }
    return true;
  };

  const deleteFeedingRecord = async (id) => {
    const updated = feedingRecords.filter(r => r.id !== id);
    setFeedingRecords(updated);
    const saved = await syncWithBackend('feedingRecords', null, 'delete', id);
    if (saved === false) {
      setFeedingRecords(feedingRecords);
      return false;
    }
    return true;
  };

  const updateFeedingRecord = async (id, record) => {
    const previous = feedingRecords;
    const updatedRecord = { ...(feedingRecords.find(item => item.id === id) || {}), ...record, id };
    const updated = feedingRecords.map(item => item.id === id ? updatedRecord : item);
    setFeedingRecords(updated);
    const saved = await syncWithBackend('feedingRecords', updatedRecord, 'update', id);
    if (saved === false) {
      setFeedingRecords(previous);
      return false;
    }
    return true;
  };

  const handleOpenReport = async (student) => {
    if (!student || (!student.id && !student._id)) { feedback.toast.error("Student ID not found."); return; }
    setLoadingReportId(student.id || student._id);
    
    // 1. Find student department and assigned template
    const studentClass = (student.class || '').toUpperCase().trim();
    const studentDept = Object.keys(departments).find(dept => departments[dept]?.includes(studentClass));
    const template = reportTemplates.find(t => t.assignedTo === studentClass) ||
      reportTemplates.find(t => t.assignedTo === studentDept);

    if (!template) {
      console.warn("[Reports] No template assigned to class/dept:", studentClass, studentDept);
    }

    // 2. Fetch/Prepare record data
    const studentReports = (reports || []).filter(r => r.studentId === student.id || (r.studentId === undefined && (r.studentSid === student.sid || r.studentName === student.name)));
    const reportData = studentReports.find(r => r.templateId === template?.id) || studentReports[0];
    
    // 3. Inject current balance for arrears pre-filling
    const fees = calculateStudentFees(student);
    const paid = (payments || []).filter(p => p.studentSid === student.sid).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const hydratedStudent = { ...student, balance: Math.max(0, fees.totalDue - paid) };

    // 4. Update state and navigate — useEffect below clears loading after activeReport commits
    setActiveReport({ student: hydratedStudent, template, reportData });
    navigate(`/edit-report/${student.id || student._id}`);
  };

  const handleSaveStudentReport = async (reportData) => {
    try {
      // Ensure required matching fields are present
      const payload = {
        ...reportData,
        type: 'manual',
        studentSid: activeReport?.student?.sid,
        studentId: activeReport?.student?.id,
        studentName: activeReport?.student?.name,
        studentClass: activeReport?.student?.class,
        // Preserve existing ID to update in-place, otherwise let server assign one
        id: activeReport?.reportData?.id || reportData.id || null,
      };

      const savedReport = await saveReportRecord(payload);
         
      // Refresh the in-memory reports list so the updated data is immediately available
      setReports(prev => {
        const idx = prev.findIndex(r => r.id === savedReport.id);
        if (idx > -1) {
          const next = [...prev];
          next[idx] = savedReport;
          return next;
        }
        return [...prev, savedReport];
      });
      // Also update the activeReport so re-opening or subsequent saves reflect the correct ID
      setActiveReport(prev => prev ? { ...prev, reportData: savedReport } : prev);
      return true;
    } catch (e) {
      console.error("Failed to save report", e);
      alert("Error saving report to server.");
    }
    return false;
  };

  const handleBulkAdd = async (text, targetClass) => {
    const lines = text.split('\n').filter(l => l.trim());
    const newStudents = lines.map((line, i) => {
      const parts = line.split(/[\t,]+/).map(p => p.trim());
      const sid = generateStudentID(targetClass, i);
      const requestId = createRequestId('student');
      return {
        id: requestId,
        requestId,
        sid: sid,
        name: (parts[0] || 'UNKNOWN').toUpperCase(),
        class: targetClass,
        gender: (parts[3] || 'M').toUpperCase().charAt(0) === 'F' ? 'F' : 'M',
        prevArrears: parseFloat(parts[1]) || 0,
        contact: parts[2] || 'N/A'
      };
    });
    const existingNames = new Set(students.map(student => `${student.name}|${student.class}`.toUpperCase()));
    const validStudents = newStudents.filter(student => {
      const key = `${student.name}|${student.class}`;
      if (student.name === 'UNKNOWN' || existingNames.has(key)) return false;
      existingNames.add(key);
      return true;
    });
    const skipped = newStudents.length - validStudents.length;
    if (!validStudents.length) return feedback.toast.warning('No valid new students were found. Check names and duplicates.');
    const approved = await feedback.confirm({ title: 'Import students?', message: `${validStudents.length} valid students will be added${skipped ? ` and ${skipped} invalid or duplicate rows skipped` : ''}.`, confirmLabel: 'Import', tone: 'primary' });
    if (!approved) return;
    setStudents(previous => [...previous, ...validStudents]);
    const results = await Promise.all(validStudents.map(student => syncWithBackend('students', student, 'add', null, student.requestId)));
    const failedIds = validStudents.filter((student, index) => !results[index]).map(student => student.id);
    if (failedIds.length) setStudents(previous => previous.filter(student => !failedIds.includes(student.id)));
    const savedCount = validStudents.length - failedIds.length;
    if (failedIds.length) feedback.toast.error(`${savedCount} students imported; ${failedIds.length} could not be saved.`);
    else feedback.toast.success(`${savedCount} students imported.`);
    setShowBulkModal(false);
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const newStudents = data.map((row, i) => {
        const rowClass = String(studentFilter || row.Class || 'Unassigned').toUpperCase();
        const requestId = createRequestId('student');
        return {
          id: requestId,
          requestId,
          sid: String(row.ID || row.StudentID || generateStudentID(rowClass, i)).toUpperCase(),
          name: String(row.Name || row.FullName || 'Unknown').toUpperCase(),
          class: rowClass,
          gender: String(row.Gender || 'M').toUpperCase().charAt(0),
          prevArrears: parseFloat(row.Arrears || 0),
          contact: String(row.Contact || 'N/A')
        };
      });
      const existingIds = new Set(students.map(student => student.sid));
      const existingNames = new Set(students.map(student => `${student.name}|${student.class}`.toUpperCase()));
      const validStudents = newStudents.filter(student => {
        const nameKey = `${student.name}|${student.class}`;
        if (student.name === 'UNKNOWN' || !['M', 'F'].includes(student.gender) || existingIds.has(student.sid) || existingNames.has(nameKey)) return false;
        existingIds.add(student.sid);
        existingNames.add(nameKey);
        return true;
      });
      const skipped = newStudents.length - validStudents.length;
      if (!validStudents.length) return feedback.toast.warning('No valid new spreadsheet rows were found.');
      const approved = await feedback.confirm({ title: 'Import spreadsheet?', message: `${validStudents.length} students are valid${skipped ? `; ${skipped} invalid or duplicate rows will be skipped` : ''}.`, confirmLabel: 'Import', tone: 'primary' });
      if (!approved) return;
      setStudents(previous => [...previous, ...validStudents]);
      const results = await Promise.all(validStudents.map(student => syncWithBackend('students', student, 'add', null, student.requestId)));
      const failedIds = validStudents.filter((student, index) => !results[index]).map(student => student.id);
      if (failedIds.length) setStudents(previous => previous.filter(student => !failedIds.includes(student.id)));
      const savedCount = validStudents.length - failedIds.length;
      if (failedIds.length) feedback.toast.error(`${savedCount} students imported; ${failedIds.length} could not be saved.`);
      else feedback.toast.success(`${savedCount} students imported.`);
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = (data, filename) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Records");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportToCSV = (data, filename) => {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(fieldName => JSON.stringify(row[fieldName] || '', (key, value) => value === null ? '' : value)).join(','))
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportClassReportsToExcel = () => {
    const targetClass = studentFilter; // e.g. "CRECHE"
    const finalClass = user?.role === 'TEACHER' ? user.assignedClass : targetClass;
    
    const classStudents = students.filter(s => !finalClass || s.class === finalClass);
    
    if (classStudents.length === 0) {
      alert("No students found in the selected class.");
      return;
    }

    const firstStudent = classStudents[0];
    const studentClass = (firstStudent?.class || '').toUpperCase().trim();
    const studentDept = Object.keys(departments).find(dept => departments[dept]?.includes(studentClass)) || 'PRIMARY';
    
    const PRESCHOOL_I_SUBJECTS = [
      'COGNITIVE SKILLS',
      'Stays alert and responds to the presence or absence of sound?',
      'Reproduces a simple beat sequence',
      'Matches environmental sounds with pictures',
      'NUMERACY SKILLS',
      'Able to recognise numerals and count in sequence (1 -50)',
      'Awareness of pre-number concepts',
      'Sort and identifies common objects in groups',
      'Sorts and matches colours and shapes',
      'CREATIVE SKILLS',
      'Responds and participates in music',
      'Participates in free and directed rhythmic activities',
      'Enjoys art and craft',
      'MOTOR SKILLS',
      'Able to initiate simple body movements',
      'Walks freely without assistance',
      'Traces simple patterns',
      'Rolls, catches, kicks and bounces ball',
      'ORAL SKILLS',
      'Recognises names and describes simple objects/diagrams and pictures',
      'Recall words in a song or rhyme',
      'Able to recite the alphabets (A - Z)',
      'INTERPERSONAL SKILLS',
      'Cooperates with others in the classroom',
      'Shares and take turns',
      'Interacts verbally with a smile, wave, a nod etc',
      'Verbalises feelings related to events that arise in the classroom',
      'Helps in simple tasks'
    ];

    const PRESCHOOL_II_SUBJECTS = [
      'LITERACY', 'NUMERACY', 'PHONICS', 'SPELLING AND DICTATION',
      'CREATIVITY', 'WRITING', 'SCIENCE',
    ];

    const PRIMARY_SUBJECTS = [
      'ENGLISH LANGUAGE', 'MATHEMATICS', 'SCIENCE', 'OUR WORLD AND OUR PEOPLE',
      'CREATIVE ARTS & DESIGN', 'HISTORY', 'RELIGIOUS & MORAL EDUCATION',
      'GHANAIAN LANGUAGE', 'COMPUTING', 'TWI'
    ];

    const JHS_SUBJECTS = [
      'ENGLISH LANGUAGE',
      'MATHEMATICS',
      'SCIENCE',
      'SOCIAL STUDIES',
      'RELIGIOUS AND MORAL EDUCATION',
      'COMPUTING',
      'GHANAIAN LANGUAGE',
      'CREATIVE ARTS AND DESIGN',
      'CAREER TECHNOLOGY',
      'FRENCH',
      'SPELLING AND DICTATION',
      'GENERAL KNOWLEDGE',
      'CRITICAL THINKING AND LOGICAL REASONING'
    ];

    let subjects = [];
    const savedSubjects = safeParse(`erp_subjects_${studentDept}`, null);
    if (savedSubjects && savedSubjects.length > 0) {
      subjects = savedSubjects;
    } else {
      if (studentDept === 'PRESCHOOL I' || studentClass.includes('CRECHE')) subjects = PRESCHOOL_I_SUBJECTS;
      else if (studentDept === 'PRESCHOOL II') subjects = PRESCHOOL_II_SUBJECTS;
      else if (studentDept === 'JHS') subjects = JHS_SUBJECTS;
      else subjects = PRIMARY_SUBJECTS;
    }

    const excelRows = [];

    classStudents.forEach(s => {
      const studentReports = (reports || []).filter(r => r.studentId === s.id || (r.studentId === undefined && (r.studentSid === s.sid || r.studentName === s.name)));
      const r = studentReports.find(rep => rep.type === 'manual') || studentReports[0];

      const row = {
        "Student ID": s.sid,
        "Student Name": s.name,
        "Class": s.class,
        "Term": r?.term || schoolInfo.term,
        "Academic Year": r?.academicYear || schoolInfo.academicYear,
        "Status": r?.status || "No Report Created"
      };

      subjects.forEach(subj => {
        if (subj.endsWith('SKILLS')) {
          return;
        }
        const scoreEntry = r?.scores?.[subj] || {};
        row[`${subj} (Class)`] = scoreEntry.classScore || '';
        row[`${subj} (Exam)`] = scoreEntry.examScore || '';
        row[`${subj} (Total)`] = scoreEntry.combinedScore || scoreEntry.total || '';
        row[`${subj} (Grade)`] = scoreEntry.grade || '';
      });

      excelRows.push(row);
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${finalClass || "School"} Reports`);
    XLSX.writeFile(wb, `${finalClass || "School"}_Class_Reports_${schoolInfo.term.replace(/\s+/g, '_')}.xlsx`);
  };


  const generateReceipt = (p, autoSave = false, paperSize = 'A5') => {
    const today = new Date().toLocaleDateString();
    let newCount = today === lastPrintDate ? printCount + 1 : 1;
    if (autoSave) {
      setPrintCount(newCount);
      setLastPrintDate(today);
      localStorage.setItem('erp_print_count', newCount);
      localStorage.setItem('erp_last_print_date', today);
    }

    const studentPayments = payments
      .filter(x => x.studentName === p.studentName && x.studentClass === p.studentClass)
      .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    const pCount = p.paymentCount || (studentPayments.findIndex(x => x.id === p.id) + 1);
    const receiptCode = `${p.studentSid || 'N/A'}-P${pCount}`;

    if (!autoSave) {
      setActiveReceipt({ ...p, receiptCode });
      return;
    }

    const isDouble = paperSize === 'A4-DOUBLE';
    const isQuad = paperSize === 'A4-QUAD';
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: (isDouble || isQuad) ? 'a4' : [148, 210]
    });

    if (!isDouble && !isQuad) {
      doc.deletePage(1);
      doc.addPage([148, 210], 'landscape');
    }

    const drawReceipt = (x, y, w, h) => {
      const centerX = x + (w / 2);

      // Receipt Border
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(x + 5, y + 5, w - 10, h - 10);

      let currentY;

      // Header Section
      try {
        const logoUrl = settings.logoUrl || '/logo.png';
        doc.addImage(logoUrl, 'PNG', x + 12, y + 10, 22, 22);
      } catch (e) { }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(88, 28, 135);
      doc.text((schoolInfo.schoolName || "TRUE STAR MONTESSORI SCHOOL").toUpperCase(), x + 38, y + 18);

      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text("EXCELLENCE IN EDUCATION & CHARACTER", x + 38, y + 23);
      doc.text(`Academic Year: ${schoolInfo.academicYear} | Term: ${schoolInfo.term}`, x + 38, y + 27);

      currentY = y + 36;
      doc.setDrawColor(126, 34, 206);
      doc.setLineWidth(0.5);
      doc.line(x + 10, currentY, x + w - 10, currentY);

      currentY += 8;
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("OFFICIAL PAYMENT RECEIPT", centerX, currentY, { align: 'center' });

      currentY += 8;
      doc.setFontSize(9);

      // Details Grid
      const leftCol = x + 15;
      const rightCol = x + (w / 2) + 20;

      doc.setFont("helvetica", "bold"); doc.text("Receipt Code:", leftCol, currentY);
      doc.setFont("helvetica", "normal"); doc.text(receiptCode, leftCol + 25, currentY);

      doc.setFont("helvetica", "bold"); doc.text("Date:", rightCol, currentY);
      doc.setFont("helvetica", "normal"); doc.text(p.date, rightCol + 10, currentY);

      currentY += 6;
      doc.setFont("helvetica", "bold"); doc.text("Student Name:", leftCol, currentY);
      doc.setFont("helvetica", "normal"); doc.text(p.studentName.toUpperCase(), leftCol + 25, currentY);

      doc.setFont("helvetica", "bold"); doc.text("Class:", rightCol, currentY);
      doc.setFont("helvetica", "normal"); doc.text(p.studentClass, rightCol + 10, currentY);

      currentY += 6;
      doc.setFont("helvetica", "bold"); doc.text("Student ID:", leftCol, currentY);
      doc.setFont("helvetica", "normal"); doc.text(p.studentSid || "N/A", leftCol + 25, currentY);

      const activeCurrency = currencySymbol;

      const studentObj = students.find(s => s.sid === p.studentSid || s.name === p.studentName);
      const fees = calculateStudentFees(studentObj);

      doc.autoTable({
        startY: currentY + 6,
        margin: { left: x + 15, right: (isQuad || isDouble) ? (210 - (x + w) + 15) : 15 },
        tableWidth: w - 30,
        head: [['Transaction Description', 'Amount']],
        body: [
          ['Tuition Fees (Termly)', `${activeCurrency} ${convertAmount(fees.currentFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['AMOUNT PAID', `${activeCurrency} ${convertAmount(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['TOTAL OUTSTANDING', `${activeCurrency} ${convertAmount(p.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['Payment Mode', p.paymentMethod || p.method || 'Cash / Mobile Money']
        ],
        theme: 'grid',
        headStyles: { fillColor: [126, 34, 206], fontSize: 10, halign: 'center' },
        styles: { fontSize: 9, cellPadding: 4, font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.row.index === 2) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontSize = 10;
          }
        }
      });

      const finalY = doc.lastAutoTable.finalY;

      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");

      doc.text("Accountant's Signature", x + 15, finalY + 18);
      doc.line(x + 15, finalY + 16, x + 55, finalY + 16);

      doc.text("Receiver's Signature", x + w - 55, finalY + 18);
      doc.line(x + w - 55, finalY + 16, x + w - 15, finalY + 16);

      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.text("\"Thank you for your partnership in providing quality education.\"", centerX, finalY + 26, { align: 'center' });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(126, 34, 206);
      doc.text("SHAPING FUTURE STARS WITH EXCELLENCE", centerX, finalY + 30, { align: 'center' });
    };

    if (isQuad) {
      drawReceipt(0, 0, 105, 148.5);
      drawReceipt(105, 0, 105, 148.5);
      drawReceipt(0, 148.5, 105, 148.5);
      drawReceipt(105, 148.5, 105, 148.5);
    } else if (isDouble) {
      drawReceipt(0, 0, 210, 148.5);
      drawReceipt(0, 148.5, 210, 148.5);
    } else {
      drawReceipt(0, 0, 210, 148);
    }

    doc.save(`Receipt_${receiptCode}.pdf`);
  };

  const generateBulkReceipts = (paymentIds) => {
    if (paymentIds.length === 0 || paymentIds.length > 4) return;
    const selectedPayments = paymentIds.map(id => payments.find(p => p.id === id)).filter(Boolean);

    const isDouble = selectedPayments.length === 2;
    const isQuad = selectedPayments.length > 2; // 3 or 4
    const isLandscape = bulkOrientation === 'landscape';
    const pageWidth = isLandscape ? 297 : 210;
    const pageHeight = isLandscape ? 210 : 297;

    const doc = new jsPDF({
      orientation: bulkOrientation,
      unit: 'mm',
      format: (isDouble || isQuad) ? 'a4' : (isLandscape ? [210, 148] : [148, 210])
    });

    const drawReceipt = (p, x, y, w, h) => {
      if (!p) return;
      const centerX = x + (w / 2);

      doc.setDrawColor(200);
      doc.setLineWidth(0.1);
      doc.rect(x, y, w, h);

      doc.setDrawColor(126, 34, 206);
      doc.setLineWidth(0.5);
      doc.line(x + 10, y + 25, x + w - 10, y + 25);

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(126, 34, 206);
      doc.text(schoolInfo.schoolName, centerX, y + 15, { align: 'center' });

      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("EXCELLENCE IN EDUCATION & CHARACTER", centerX, y + 20, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text("OFFICIAL PAYMENT RECEIPT", centerX, y + 32, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      let currentY = y + 42;
      const receiptCode = `${p.studentSid || 'N/A'}-P${p.paymentCount || '1'}`;

      doc.text(`Receipt Code: ${receiptCode}`, x + 15, currentY);
      currentY += 4;
      doc.text(`Student: ${p.studentName.toUpperCase()}`, x + 15, currentY);
      currentY += 4;
      doc.text(`Class: ${p.studentClass}`, x + 15, currentY);
      currentY += 4;
      doc.text(`Date: ${p.date}`, x + 15, currentY);
      currentY += 4;
      doc.text(`Academic Year: ${schoolInfo.academicYear}`, x + 15, currentY);
      currentY += 4;
      doc.text(`Term: ${schoolInfo.term}`, x + 15, currentY);

      doc.autoTable({
        startY: currentY + 3,
        margin: { left: x + 15, right: x + 15 },
        tableWidth: w - 30,
        head: [['Description', 'Amount (GHc)']],
        body: [
          ['Amount Paid', `GHc ${parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['OUTSTANDING BALANCE', `GHc ${parseFloat(p.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['Payment Method', p.paymentMethod || p.method || 'Cash/Transfer']
        ],
        theme: 'striped',
        headStyles: { fillColor: [126, 34, 206], fontSize: 10 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold' } },
        didParseCell: function (data) {
          if (data.row.index === 1) { // OUTSTANDING BALANCE row
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 11;
            data.cell.styles.textColor = [239, 68, 68]; // Intense Red
          }
        }
      });

      const finalY = doc.lastAutoTable.finalY;
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.text("\"Thank you for your prompt payment. Keep this receipt for your records.\"", centerX, finalY + 8, { align: 'center' });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(126, 34, 206);
      doc.text("www.truestar.com", centerX, finalY + 12, { align: 'center' });
    };

    if (bulkLayout === 'row') {
      const n = selectedPayments.length;
      const w = pageWidth / n;
      const h = pageHeight;
      selectedPayments.forEach((p, i) => drawReceipt(p, i * w, 0, w, h));
    } else if (bulkLayout === 'column') {
      const n = selectedPayments.length;
      const w = pageWidth;
      const h = pageHeight / n;
      selectedPayments.forEach((p, i) => drawReceipt(p, 0, i * h, w, h));
    } else if (isDouble) {
      if (isLandscape) {
        drawReceipt(selectedPayments[0], 0, 0, pageWidth / 2, pageHeight);
        drawReceipt(selectedPayments[1], pageWidth / 2, 0, pageWidth / 2, pageHeight);
      } else {
        drawReceipt(selectedPayments[0], 0, 0, pageWidth, pageHeight / 2);
        drawReceipt(selectedPayments[1], 0, pageHeight / 2, pageWidth, pageHeight / 2);
      }
    } else {
      drawReceipt(selectedPayments[0], 0, 0, isLandscape ? 210 : 148, isLandscape ? 148 : 210);
    }

    // Open preview instead of download
    window.open(doc.output('bloburl'), '_blank');
  };

  const checkDuplicates = () => {
    const names = students.map(s => s.name);
    const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
    if (duplicates.length === 0) {
      alert("No duplicate student names found! Everything looks clean.");
    } else {
      alert(`Duplicate names found:\n${duplicates.join(', ')}\n\nPlease review these records in the student list.`);
    }
  };

  const generateClassRecord = () => {
    if (!studentFilter) return alert("Select a class first!");
    const classList = students.filter(s => s.class === studentFilter);
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(schoolInfo.schoolName, 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`CLASS RECORD: ${studentFilter} (${schoolInfo.academicYear})`, 105, 25, { align: 'center' });
    doc.autoTable({
      startY: 30,
      head: [['ID', 'Name', 'Gender', 'Contact']],
      body: classList.map(s => [s.sid, s.name, s.gender, s.contact]),
      theme: 'striped',
      headStyles: { fillColor: [126, 34, 206] }
    });
    doc.save(`Class_Record_${studentFilter}.pdf`);
  };

  const handleProcessPayment = async (studentId, amount, method = 'Not recorded') => {
    if (!['ADMIN', 'ACCOUNTANT'].includes((user?.role || '').toUpperCase())) {
      alert('Only administrators and accountants can record payments.');
      return false;
    }
    const sList = user?.role === 'TEACHER' ? filteredStudents : students;
    const student = sList.find(s => s.id === studentId);
    if (!student) return;

    const numericAmount = Number(amount);
    const totalPaidSoFar = payments
      .filter(p => p.studentSid === student.sid)
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const fees = calculateStudentFees(student);
    const totalExpected = fees.totalDue;
    const outstanding = Math.max(0, totalExpected - totalPaidSoFar);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > outstanding) {
      alert(`Enter an amount between 0.01 and ${currencySymbol}${convertAmount(outstanding).toLocaleString()}.`);
      return false;
    }
    const newBalance = outstanding - numericAmount;

    const studentPayments = payments
      .filter(p => p.studentSid === student.sid);
    const paymentCount = studentPayments.length + 1;

    const requestId = createRequestId();
    const newPay = {
      id: requestId,
      requestId,
      studentName: student.name,
      studentClass: student.class,
      studentSid: student.sid,
      paymentCount: paymentCount,
      prevArrears: student.prevArrears || 0,
      amount: numericAmount,
      balance: newBalance,
      addedBy: user?.name || 'Admin',
      paymentMethod: method,
      method,
      date: new Date().toISOString().split('T')[0],
      syncStatus: networkStatus === 'online' ? 'saving' : 'queued'
    };
    setPayments(prev => [...prev, newPay]);
    const paymentSaved = await syncWithBackend('payments', newPay, 'add', null, requestId);
    if (paymentSaved === false) {
      setPayments(prev => prev.filter(p => p.id !== newPay.id));
      return false;
    }
    setPayments(prev => prev.map(p => p.id === newPay.id ? { ...p, syncStatus: paymentSaved === 'queued' ? 'queued' : 'saved' } : p));

    // SMS Notifications
    if (student && student.contact && smsEnabled) {
      const notifications = [];
      // 1. Payment Received SMS
      notifications.push(sendSMS(student.contact, `Payment received for ${student.name}. Thank you.`));

      // 2. Outstanding Balance SMS
      const fees = calculateStudentFees(student);
      const totalFees = fees.totalDue;
      const paidSoFar = [...payments.filter(p => p.studentSid === student.sid), newPay]
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balance = totalFees - paidSoFar;

      if (balance > 0) {
        notifications.push(sendSMS(student.contact, `${student.name} has an outstanding balance of ₵ ${balance.toLocaleString()}. Please pay as soon as possible.`));
      }
      const smsResults = await Promise.all(notifications);
      if (smsResults.some(result => !result)) feedback.toast.warning('Payment saved, but one or more SMS notifications were not sent.');
    }
    return true;
  };

  const handleGenerateIDCard = (event) => {
    const student = event.detail;
    if (!student) return;

    // Landscape credit-card format: 85.6 × 54 mm
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });

    const W = 85.6, H = 54;

    // ── Background ────────────────────────────────────────────
    doc.setFillColor(15, 23, 42);          // dark navy
    doc.rect(0, 0, W, H, 'F');

    // Left accent strip
    doc.setFillColor(126, 34, 206);
    doc.rect(0, 0, 3, H, 'F');

    // ── HEADER (full width, top) ──────────────────────────────
    const headerH = 16;
    // subtle header bg
    doc.setFillColor(20, 33, 61);
    doc.rect(3, 0, W - 3, headerH, 'F');
    // bottom border of header
    doc.setDrawColor(126, 34, 206);
    doc.setLineWidth(0.5);
    doc.line(3, headerH, W, headerH);

    try {
      const logo = settings.logoUrl || '/logo.png';
      doc.addImage(logo, 'PNG', 3.5, 1, 14, 14);
    } catch (e) { /* ignore */ }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text((schoolInfo.schoolName || 'SCHOOL NAME').toUpperCase(), (W + 17) / 2, 7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(126, 34, 206);
    doc.text('OFFICIAL STUDENT IDENTIFICATION CARD', W / 2 + 1.5, 12.5, { align: 'center' });

    // ── PHOTO (left column, below header) ────────────────────
    const photoX = 6, photoY = headerH + 3, photoW = 20, photoH = 26;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'F');

    if (student.photoUrl) {
      try {
        doc.addImage(student.photoUrl, 'JPEG', photoX + 0.5, photoY + 0.5, photoW - 1, photoH - 1);
      } catch (e) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'italic');
        doc.text('NO PHOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
      }
    } else {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(5);
      doc.setFont('helvetica', 'italic');
      doc.text('NO PHOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
    }

    // Sequence number below photo
    const seqNum = student.sid ? student.sid.replace(/\D/g, '').slice(-4) : '--';
    doc.setFontSize(5);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${seqNum}`, photoX + photoW / 2, photoY + photoH + 4, { align: 'center' });

    // ── STUDENT INFO (right column) ───────────────────────────
    const infoX = photoX + photoW + 5;
    let infoY = headerH + 8;
    const lineH = 6;

    // Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const name = (student.name || 'UNKNOWN').toUpperCase();
    doc.text(name, infoX, infoY, { maxWidth: W - infoX - 5 });

    infoY += lineH;
    const fields = [
      ['STUDENT ID', student.sid || '--'],
      ['CLASS', student.class || '--'],
      ['EXPIRY', 'AUG 2027'],
    ];
    fields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(126, 34, 206);
      doc.text(label + ':', infoX, infoY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(220, 220, 220);
      doc.text(String(value), infoX + 18, infoY);
      infoY += lineH;
    });

    // ── FOOTER ────────────────────────────────────────────────
    doc.setFillColor(10, 15, 30);
    doc.rect(3, H - 8, W - 3, 8, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5);
    doc.setTextColor(120, 120, 120);
    doc.text('If found, please return to school office.', W / 2 + 1.5, H - 3, { align: 'center' });

    window.open(doc.output('bloburl'), '_blank');
  };

  useEffect(() => {
    window.addEventListener('generate-id-card', handleGenerateIDCard);
    return () => window.removeEventListener('generate-id-card', handleGenerateIDCard);
  }, [schoolInfo, students]);

  const saveAttendance = async (date, data, metadata = {}) => {
    const attendanceWithUser = {
      records: data,
      lastUpdatedBy: user?.name || 'Admin',
      timestamp: new Date().toISOString(),
      notes: metadata.notes || ''
    };
    const newAttendance = { ...attendance, [date]: attendanceWithUser };
    setAttendance(newAttendance);
    // Attendance is currently stored as a large object in the attendance key
    const saved = await syncWithBackend('attendance', newAttendance, 'replace');
    if (saved === false) {
      setAttendance(attendance);
      return false;
    }
    return true;
  };

  const saveExpenditure = async (newExp) => {
    const previous = expenditures;
    try {
      const requestId = createRequestId('expense');
      const transaction = { ...newExp, id: requestId, requestId, schoolId: user?.schoolId };
      const updatedList = [...expenditures, transaction];
      
      setExpenditures(updatedList);
      const success = await syncWithBackend('expenditures', updatedList, 'replace');
      
      if (success !== false) {
        alert("Transaction saved successfully!");
        return true;
      } else {
        setExpenditures(previous);
        alert("Failed to sync expenditure with server.");
        return false;
      }
    } catch (e) {
      setExpenditures(previous);
      console.error("Failed to save expenditure", e);
      alert("Error saving transaction.");
      return false;
    }
  };

  const saveFeedingConfig = async (newConfig) => {
    const previous = feedingConfig;
    setFeedingConfig(newConfig);
    const saved = await syncWithBackend('feedingConfig', newConfig, 'replace');
    if (!saved) {
      setFeedingConfig(previous);
      feedback.toast.error('Feeding configuration was not saved.');
      return false;
    }
    return true;
  };

  const saveSchoolInfo = async (nextSchoolInfo = schoolInfo) => {
    const saved = await syncWithBackend('schoolInfo', nextSchoolInfo, 'replace');
    if (!saved) feedback.toast.error('School information was not saved.');
    return saved;
  };

  const changeCurrency = async (nextCurrency) => {
    const previous = currencyCode;
    setCurrencyCode(nextCurrency);
    const saved = await syncWithBackend('currency', nextCurrency, 'replace');
    if (!saved) {
      setCurrencyCode(previous);
      feedback.toast.error('Currency was not changed.');
    }
  };



  if (!user) return <Login onLogin={handleLogin} onSignup={handleSignup} onRegisterInstitution={handleRegisterInstitution} settings={settings} schoolInfo={schoolInfo} allClasses={allClasses && allClasses.length > 0 ? allClasses : fallbackClasses} backendUrl={CONFIG.backendUrl} />;

  return (
    <div id="main-layout" className="screen" style={{
      '--bg-image': settings.backgroundUrl ? `linear-gradient(${theme === 'dark' ? 'rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.5)' : 'rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.3)'}), url(${settings.backgroundUrl})` : 'none',
      backgroundColor: 'var(--bg-page)'
    }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {isLoading && <div id="loading-overlay" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div><span className="sr-only">Loading, please wait</span></div>}
      <SyncManager />

      {/* Sidebar Overlay for mobile */}
      {sidebarOpen && <button type="button" className="mobile-only sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}></button>}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar" aria-label="Primary navigation" aria-hidden={isMobileNav && !sidebarOpen ? 'true' : undefined} {...(isMobileNav && !sidebarOpen ? { inert: '' } : {})} style={{ zIndex: 100, display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 10px' }}>
          <img src={branding.logoUrl || settings.logoUrl || "/logo.png"} alt="Logo" style={{ width: '70px', height: '70px', marginBottom: '10px', borderRadius: '15px' }} />
          <h2 style={{ fontSize: '15px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>{branding.schoolName || schoolInfo.schoolName}</h2>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px',
            fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
            padding: '4px 10px', borderRadius: '20px',
            background: isSyncing ? 'rgba(59,130,246,0.1)' : (networkStatus === 'online' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'),
            color: isSyncing ? '#3b82f6' : (networkStatus === 'online' ? '#22c55e' : '#ef4444'),
            border: `1px solid ${isSyncing ? 'rgba(59,130,246,0.2)' : (networkStatus === 'online' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)')}`
          }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: 'currentColor',
              animation: isSyncing || networkStatus === 'offline' ? 'pulse 1.5s infinite' : 'none'
            }}></div>
            {isSyncing ? 'Syncing...' : (networkStatus === 'online' ? 'Online' : 'Offline Mode')}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-sidebar)', letterSpacing: '1px', marginTop: '8px' }}>v2.9.0-LIVE-SYNC</p>
          <button className="mobile-only btn btn-icon" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', top: '10px', right: '10px' }}><X size={18} aria-hidden="true" /></button>
        </div>
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          {/* DASHBOARD — all roles */}
          <Link to="/" aria-current={activeView === 'dashboard' ? 'page' : undefined} className={`nav-link ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={18} /> Dashboard
          </Link>

          {/* STUDENTS — all roles */}
          <Link to="/students" aria-current={activeView === 'students' ? 'page' : undefined} className={`nav-link ${activeView === 'students' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <Users size={18} /> Students
            {user?.role === 'TEACHER'
              ? <span className="nav-badge" style={{ background: 'var(--accent)', fontSize: '9px' }}>{filteredStudents.length}</span>
              : <span className="nav-badge">{students.length}</span>
            }
          </Link>

          {/* ATTENDANCE — ADMIN + TEACHER */}
          {(user?.role === 'ADMIN' || user?.role === 'TEACHER') && (
            <Link to="/attendance" aria-current={activeView === 'attendance' ? 'page' : undefined} className={`nav-link ${activeView === 'attendance' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <CheckCircle size={18} /> Attendance
            </Link>
          )}

          {/* PAYMENTS & FINANCE — ADMIN + ACCOUNTANT */}
          {(user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') && (
            <>
              <Link to="/payments" aria-current={activeView === 'payments' ? 'page' : undefined} className={`nav-link ${activeView === 'payments' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <Wallet size={18} /> Payments
              </Link>
              <Link to="/expenditure" aria-current={activeView === 'expenditure' ? 'page' : undefined} className={`nav-link ${activeView === 'expenditure' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <TrendingDown size={18} /> Expenditure
              </Link>
              <Link to="/feeding" aria-current={activeView === 'feeding' ? 'page' : undefined} className={`nav-link ${activeView === 'feeding' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <Utensils size={18} /> Feeding
              </Link>

            </>
          )}

          {/* REPORTS — ADMIN and TEACHER only (not ACCOUNTANT) */}
          {(user?.role?.toUpperCase() !== 'ACCOUNTANT') && (
            <Link to="/reports" aria-current={activeView === 'reports' ? 'page' : undefined} className={`nav-link ${activeView === 'reports' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <FileText size={18} /> Report Cards
            </Link>
          )}

          {/* STAFF — ADMIN + ACCOUNTANT */}
          {(user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'ACCOUNTANT') && (
            <Link to="/staff" aria-current={activeView === 'staff' ? 'page' : undefined} className={`nav-link ${activeView === 'staff' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <User size={18} /> Staff <span className="nav-badge" style={{ background: 'var(--accent)' }}>{staff.length}</span>
            </Link>
          )}

          <Link to="/staff-workspace" aria-current={activeView === 'staff-workspace' ? 'page' : undefined} className={`nav-link ${activeView === 'staff-workspace' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <Briefcase size={18} /> Staff Workspace
          </Link>

          {(user?.role?.toUpperCase() === 'ADMIN' || user?.role === 'TRANSPORT_MANAGER') && (
            <Link to="/transport" aria-current={activeView === 'transport' ? 'page' : undefined} className={`nav-link ${activeView === 'transport' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <Bus size={18} /> Transport
            </Link>
          )}

          <div style={{ flex: 1 }}></div>

          {/* SETTINGS — ADMIN only */}
          {user?.role?.toUpperCase() === 'ADMIN' && (
            <Link to="/settings" aria-current={activeView === 'settings' ? 'page' : undefined} className={`nav-link ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <AlertCircle size={18} /> Settings
            </Link>
          )}

          {/* TRASH — ADMIN only */}
          {user?.role?.toUpperCase() === 'ADMIN' && (
            <Link to="/trash" aria-current={activeView === 'trash' ? 'page' : undefined} className={`nav-link ${activeView === 'trash' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <Trash2 size={18} /> Recycle Bin
            </Link>
          )}

          {/* ACCESS — ADMIN only */}
          {user?.role?.toUpperCase() === 'ADMIN' && (
            <Link to="/access" aria-current={activeView === 'access' ? 'page' : undefined} className={`nav-link ${activeView === 'access' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <ShieldCheck size={18} /> System Access
            </Link>
          )}

        </nav>
        <div className="sidebar-footer">
          <div className="user-info" style={{ marginBottom: '6px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>{(user?.name || 'User').toUpperCase()}</div>
            <span style={{
              display: 'inline-block', marginTop: '4px',
              padding: '2px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 800, letterSpacing: '1px',
              background: user?.role === 'ADMIN' ? 'rgba(239,68,68,0.15)' : user?.role === 'ACCOUNTANT' ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.15)',
              color: user?.role === 'ADMIN' ? '#ef4444' : user?.role === 'ACCOUNTANT' ? '#22c55e' : '#a855f7',
              border: `1px solid ${user?.role === 'ADMIN' ? 'rgba(239,68,68,0.3)' : user?.role === 'ACCOUNTANT' ? 'rgba(34,197,94,0.3)' : 'rgba(168,85,247,0.3)'}`
            }}>{user?.role || 'USER'}</span>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '5px 0' }}>Stable Release</p>
          <button onClick={handleLogout} className="btn btn-secondary btn-block logout-btn">
            <LogOut size={16} /> LOGOUT
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" className="main-content" tabIndex="-1">
        <header className="topbar">
          <button className="mobile-only btn btn-icon mobile-sidebar-trigger" aria-label="Open navigation" aria-expanded={sidebarOpen} aria-controls="sidebar" onClick={() => setSidebarOpen(true)}><Menu size={18} aria-hidden="true" /></button>
          <div className="premium-search desktop-search-hidden" style={{ flex: 1, maxWidth: '500px' }}>
            <input
              type="text"
              aria-label="Search current page"
              placeholder={location.pathname === '/reports' ? 'Search reports...' : 'Search students...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="search-icon" size={18} />
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              className="btn btn-secondary"
              aria-label="Display currency"
              style={{ width: 'auto', borderRadius: '12px', fontWeight: 700, height: '44px', fontSize: '12px', padding: '0 10px' }}
              value={currencyCode}
              onChange={(e) => changeCurrency(e.target.value)}
            >
              <option value="GHS">GH₵</option>
              <option value="USD">$</option>
              <option value="GBP">£</option>
            </select>
            <button
              className="btn btn-icon btn-secondary theme-toggle"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title="Toggle Theme"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>

        <div className="content-area">
          {dataNotice && (
            <div className={`app-data-notice ${dataNotice.type}`} role={dataNotice.type === 'error' ? 'alert' : 'status'}>
              <AlertCircle size={17} aria-hidden="true" />
              <span>{dataNotice.message}</span>
              <button type="button" aria-label="Dismiss notice" onClick={() => setDataNotice(null)}><X size={16} aria-hidden="true" /></button>
            </div>
          )}
          {!location.pathname.startsWith('/edit-report') && !location.pathname.startsWith('/bulk-print') && (
            <div className="print-only-header">
              <img src={settings.logoUrl || "/logo.png"} alt="Logo" style={{ width: '60px', height: '60px', marginBottom: '10px' }} />
              <h1 style={{ margin: 0, fontSize: '24px', whiteSpace: 'nowrap' }}>{schoolInfo.schoolName}</h1>
              <p style={{ margin: 0, color: 'var(--text-main)' }}>
                {location.pathname === '/staff' ? 'Official Staff Records' :
                  location.pathname === '/payments' ? 'Official Payment Records' :
                    'Official Student Records'} - {new Date().toLocaleDateString()}
              </p>
            </div>
          )}
          <Suspense fallback={<div className="route-skeleton" role="status"><div className="spinner" /><span>Loading workspace...</span></div>}>
          <Routes>
            <Route path="/" element={
              <section className="view active dashboard-view">
                <div className="dashboard-hero">
                  <div>
                    <span className="dashboard-eyebrow"><CalendarDays size={14} /> {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {(user?.name || 'Admin').split(' ')[0]}</h1>
                    <p>Here is the latest financial and operational overview for {schoolInfo.schoolName || 'your school'}.</p>
                  </div>
                  <div className="dashboard-hero-actions">
                    <button className="btn btn-secondary" onClick={() => navigate('/students')}><Users size={16} /> View Students</button>
                    {user?.role?.toUpperCase() !== 'TEACHER' && <button className="btn btn-primary" onClick={() => navigate('/payments')}><ReceiptText size={16} /> View Payments</button>}
                  </div>
                </div>

                <div className="dashboard-kpi-grid">
                  <DashboardKpi icon={Users} label="Student population" value={stats.total.toLocaleString()} detail={`${stats.males} male · ${stats.females} female`} tone="blue" onClick={() => { setGenderFilter('all'); navigate('/students'); }} />
                  {user?.role?.toUpperCase() !== 'TEACHER' && <DashboardKpi icon={Banknote} label="Total revenue" value={`${currencySymbol}${convertAmount(stats.revenue).toLocaleString()}`} detail={`${stats.monthCount} payments this month`} tone="green" onClick={() => navigate('/payments')} />}
                  <DashboardKpi icon={Wallet} label="Outstanding arrears" value={`${currencySymbol}${convertAmount(stats.arrears).toLocaleString()}`} detail="Across active student accounts" tone="amber" onClick={() => { setStudentFilter(''); setArrearsFilter('current'); navigate('/students'); }} />
                  {user?.role?.toUpperCase() !== 'TEACHER' && <DashboardKpi icon={stats.netProfit >= 0 ? TrendingUp : TrendingDown} label={`Net ${stats.netProfit >= 0 ? 'profit' : 'loss'}`} value={`${currencySymbol}${convertAmount(stats.netProfit).toLocaleString()}`} detail={`${currencySymbol}${convertAmount(stats.totalExpenses).toLocaleString()} total expenditure`} tone={stats.netProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/expenditure')} />}
                </div>

                <div className="dashboard-main-grid">
                  <article className="dashboard-panel dashboard-chart-panel">
                    <div className="dashboard-panel-heading">
                      <div><span>Revenue trend</span><h2>Last 14 days</h2></div>
                      <span className="dashboard-panel-badge">Live overview</span>
                    </div>
                    <DashboardChart payments={filteredPayments} currency={currencySymbol} convertAmount={convertAmount} />
                  </article>

                  <article className="dashboard-panel dashboard-pulse-panel">
                    <div className="dashboard-panel-heading">
                      <div><span>Cash flow</span><h2>Payment pulse</h2></div>
                      <span className="dashboard-pulse-icon"><Activity size={18} /></span>
                    </div>
                    <div className="dashboard-pulse-total">
                      <span>Collected this month</span>
                      <strong>{currencySymbol}{convertAmount(stats.monthRevenue).toLocaleString()}</strong>
                    </div>
                    <div className="dashboard-period-grid">
                      <DashboardPeriodMetric label="Today" value={`${currencySymbol}${convertAmount(stats.todayRevenue).toLocaleString()}`} onClick={() => { setPaymentDateFilter('today'); navigate('/payments?period=today'); }} />
                      <DashboardPeriodMetric label="This week" value={`${currencySymbol}${convertAmount(stats.weekRevenue).toLocaleString()}`} onClick={() => { setPaymentDateFilter('week'); navigate('/payments?period=week'); }} />
                      <DashboardPeriodMetric label="This month" value={`${stats.monthCount} payments`} onClick={() => { setPaymentDateFilter('month'); navigate('/payments?period=month'); }} />
                    </div>
                  </article>
                </div>

                {user?.role?.toUpperCase() !== 'TEACHER' && (
                  <div className="dashboard-operations">
                    <button type="button" onClick={() => navigate('/feeding')}><span className="tone-purple"><Utensils size={17} /></span><div><small>Feeding revenue</small><strong>{currencySymbol}{convertAmount(stats.feedingRevenue).toLocaleString()}</strong></div><ArrowUpRight size={16} /></button>
                    <button type="button" onClick={() => navigate('/expenditure')}><span className="tone-red"><ReceiptText size={17} /></span><div><small>Expenditure</small><strong>{currencySymbol}{convertAmount(stats.totalExpenses).toLocaleString()}</strong></div><ArrowUpRight size={16} /></button>
                    {user?.role?.toUpperCase() === 'ADMIN' && <button type="button" onClick={() => navigate('/trash')}><span className="tone-amber"><Archive size={17} /></span><div><small>Recycle bin</small><strong>{deleted.length} {deleted.length === 1 ? 'item' : 'items'}</strong></div><ArrowUpRight size={16} /></button>}
                    {user?.role?.toUpperCase() === 'ADMIN' && <div className="dashboard-activity-summary"><span><LogIn size={16} /> Logins <strong>{stats.monthLogins}</strong></span><span><UserPlus size={16} /> Signups <strong>{stats.monthSignups}</strong></span><small>This month</small></div>}
                  </div>
                )}
              </section>
            } />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />

            <Route path="/staff-workspace" element={
              <StaffWorkspace
                user={user}
                staff={staff}
                staffAttendance={staffAttendance}
                setStaffAttendance={setStaffAttendance}
                staffQuestions={staffQuestions}
                setStaffQuestions={setStaffQuestions}
                lessonNotes={lessonNotes}
                setLessonNotes={setLessonNotes}
                staffAwards={staffAwards}
                setStaffAwards={setStaffAwards}
                staffDisciplinary={staffDisciplinary}
                setStaffDisciplinary={setStaffDisciplinary}
                staffTasks={staffTasks}
                setStaffTasks={setStaffTasks}
                students={students}
                attendance={attendance}
                reports={reports}
                currency={currencySymbol}
                convertAmount={convertAmount}
                backendUrl={CONFIG.backendUrl}
                token={token}
                syncWithBackend={syncWithBackend}
                schoolInfo={schoolInfo}
              />
            } />

            <Route path="/transport" element={
              <ProtectedRoute allowedRoles={['ADMIN', 'TRANSPORT_MANAGER']} userRole={user?.role}>
                <Transport 
                  students={students}
                  setStudents={setStudents}
                  routes={transportRoutes}
                  buses={buses}
                  drivers={drivers}
                  enrollments={transportEnrollments}
                  setEnrollments={setTransportEnrollments}
                  invoices={transportInvoices}
                  currency={currencySymbol}
                  convertAmount={convertAmount}
                  allClasses={allClasses}
                  syncWithBackend={syncWithBackend}
                  backendUrl={CONFIG.backendUrl}
                  token={token}
                  userRole={user?.role}
                  maintenanceRecords={transportMaintenance}
                  setMaintenanceRecords={setTransportMaintenance}
                />
              </ProtectedRoute>
            } />

            <Route path="/students" element={
              <section className="view active students-page-view">
                <div className="view-header">

                  <h1>Students</h1>
                  <div className="toolbar-group">
                    <div className="premium-search" style={{ flex: 1, minWidth: '200px' }}>
                      <input
                        type="text"
                        placeholder="Search by Name, Class, or Date..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Search className="search-icon" size={18} />
                    </div>
                    {user?.role !== 'TEACHER' && (
                      <button className="btn btn-primary" onClick={() => setShowStudentModal(true)}>
                        <Plus size={18} /> Enroll Student
                      </button>
                    )}

                    <div className="dropdown">
                      <button className="btn btn-secondary dropdown-toggle" onClick={() => {
                        const menu = document.getElementById('student-filter-menu');
                        menu.classList.toggle('hidden');
                      }}>
                        Filter & Sort ▾
                      </button>
                      <div id="student-filter-menu" className="dropdown-menu hidden" style={{ width: '260px', padding: '15px' }}>
                        {user?.role !== 'TEACHER' && (
                          <div className="form-group mb-1">
                            <label style={{ color: 'var(--text-main)' }}>Filter by Class</label>
                            <select className="btn-block" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
                              <option value="">All Classes</option>
                              {Array.from(new Set([...(allClasses || []), ...students.map(s => (s.class || '').trim()).filter(Boolean)])).map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>

                          </div>
                        )}
                        <div className="form-group mb-1">
                          <label>Filter by Gender</label>
                          <select className="btn-block" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                            <option value="all">All Genders</option>
                            <option value="M">Male</option>
                            <option value="F">Female</option>
                          </select>
                        </div>
                        <div className="form-group mb-1">
                          <label>Filter by Fees</label>
                          <select className="btn-block" value={arrearsFilter} onChange={(e) => setArrearsFilter(e.target.value)}>
                            <option value="all">All Records</option>
                            <option value="previous">Previous Arrears</option>
                            <option value="current">Current Outstanding</option>
                          </select>
                        </div>
                        <div className="form-group mb-1">
                          <label>Sort By</label>
                          <select className="btn-block" value={studentSort} onChange={(e) => setStudentSort(e.target.value)}>
                            <option value="name">Name A-Z</option>
                            <option value="sid">Student ID</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {user?.role === 'TEACHER' && (
                      <button className="btn btn-outline" onClick={() => setShowReminderModal(true)}>
                        <Bell size={16} aria-hidden="true" /> Reminders
                      </button>
                    )}

                    {user?.role !== 'TEACHER' && (
                      <div className="dropdown">
                        <button className="btn btn-outline dropdown-toggle" onClick={() => {
                          const menu = document.getElementById('student-actions-menu');
                          menu.classList.toggle('hidden');
                        }}>
                          Data Actions ▾
                        </button>
                        <div id="student-actions-menu" className="dropdown-menu hidden" style={{ width: '230px' }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); setShowBulkModal(true); }}><ClipboardPaste size={15} aria-hidden="true" /> Bulk Add (Paste)</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('excel-import').click(); }}><Upload size={15} aria-hidden="true" /> Import Excel</a>
                          <a href="#" onClick={(e) => { 
                            e.preventDefault(); 
                            const formatted = displayStudents.map((s, i) => ({
                              "Sr #": i + 1,
                              "Student ID": s.sid,
                              "Student Name": s.name,
                              "Class": s.class,
                              "Gender": s.gender || 'M',
                              "Contact": s.contact || 'N/A',
                              "Parent / Guardian": s.residence || 'N/A',
                              "Balance": convertAmount(studentBalances[s.sid]?.balance || 0).toFixed(2)
                            }));
                            exportToExcel(formatted, `Students_${studentFilter || 'All'}`); 
                          }}><FileSpreadsheet size={15} aria-hidden="true" /> Export Excel</a>
                          <a href="#" onClick={(e) => { 
                            e.preventDefault(); 
                            const formatted = displayStudents.map((s, i) => ({
                              "Sr #": i + 1,
                              "Student ID": s.sid,
                              "Student Name": s.name,
                              "Class": s.class,
                              "Gender": s.gender || 'M',
                              "Contact": s.contact || 'N/A',
                              "Parent / Guardian": s.residence || 'N/A',
                              "Balance": convertAmount(studentBalances[s.sid]?.balance || 0).toFixed(2)
                            }));
                            exportToCSV(formatted, `Students_${studentFilter || 'All'}`); 
                          }}><FileText size={15} aria-hidden="true" /> Export CSV</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); setShowRegisterModal(true); }}><Printer size={15} aria-hidden="true" /> Print Student Register / PDF</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); generateClassRecord(); }}><ScrollText size={15} aria-hidden="true" /> Class Record (PDF)</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); checkDuplicates(); }} style={{ color: 'var(--accent)' }}><Search size={15} aria-hidden="true" /> Check for Duplicates</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); setShowReminderModal(true); }}><Bell size={15} aria-hidden="true" /> Send Arrears Reminders</a>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {(studentFilter || genderFilter !== 'all' || arrearsFilter !== 'all') && (
                  <div className="flex-gap mb-1" style={{ flexWrap: 'wrap' }}>
                    {studentFilter && (
                      <span className="filter-pill">
                        Class: {studentFilter}
                        {user?.role !== 'TEACHER' && (
                          <button type="button" className="filter-pill-remove" aria-label={`Remove ${studentFilter} class filter`} onClick={() => setStudentFilter('')}><X size={12} aria-hidden="true" /></button>
                        )}
                      </span>
                    )}
                    {genderFilter !== 'all' && <span className="filter-pill">Gender: {genderFilter} <button type="button" className="filter-pill-remove" aria-label="Remove gender filter" onClick={() => setGenderFilter('all')}><X size={12} aria-hidden="true" /></button></span>}
                    {arrearsFilter !== 'all' && <span className="filter-pill">Fees: {arrearsFilter} <button type="button" className="filter-pill-remove" aria-label="Remove fees filter" onClick={() => setArrearsFilter('all')}><X size={12} aria-hidden="true" /></button></span>}
                  </div>
                )}

                <input
                  type="file"
                  id="excel-import"
                  style={{ display: 'none' }}
                  accept=".xlsx,.csv"
                  onChange={handleExcelImport}
                />

                {studentFilter && (() => {
                  const classStudents = students.filter(s => (s.class || '').trim().toUpperCase() === studentFilter.trim().toUpperCase());
                  const classTeacher = staff.find(t => (t.assignedClass || '').trim().toUpperCase() === studentFilter.trim().toUpperCase());
                  return classStudents.length > 0 ? (

                    <div className="class-summary-container mb-2">
                      <div className="class-pill" style={{ borderColor: 'var(--primary)', background: 'var(--accent-glow)' }}>
                        <span>{classStudents.length}</span>
                        <small>{studentFilter}</small>
                      </div>
                      {classTeacher && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', padding: '6px 14px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--glass-border)', fontSize: '13px' }}>
                          <span style={{ color: 'var(--text-main)' }}>Class Teacher:</span>
                          <strong style={{ color: 'var(--accent)' }}>{classTeacher.name}</strong>
                          <span style={{ color: 'var(--text-main)', fontSize: '11px' }}>({classTeacher.contact})</span>
                        </div>
                      )}
                      <span style={{ color: 'var(--text-main)', fontSize: '13px', alignSelf: 'center', marginLeft: '10px' }}>
                        students in this class
                      </span>
                    </div>
                  ) : null;
                })()}

                <div className="students-table-wrapper table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Contact</th>
                        <th>Balance</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>

                      {displayStudents.length === 0 && (
                        <tr><td colSpan="6" className="table-empty-state">No students match the current search or filters.</td></tr>
                      )}
                      {studentPagination.paginatedItems.map(s => {
                        const stats = studentBalances[s.sid] || { totalPaid: 0, balance: 0 };
                        const balance = stats.balance;

                        return (
                          <tr key={s.id}>
                            <td>{s.sid}</td>
                            <td>
                              <a href="#" onClick={(e) => { e.preventDefault(); setSelectedProfile(s); setShowProfileModal(true); }} className="name-link">
                                {s.name}
                              </a>
                            </td>
                            <td>{s.class}</td>
                            <td>{s.contact}</td>
                            <td style={{ fontWeight: 800, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                              {arrearsFilter === 'previous'
                                ? <>{currencySymbol}{convertAmount(s.prevArrears || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '10px', color: 'var(--text-main)' }}>(prev)</span></>
                                : <>{currencySymbol}{convertAmount(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>}
                            </td>
                            <td><div className="table-actions">
                              {/* Fill Report — ADMIN + TEACHER only */}
                              {(user?.role === 'ADMIN' || user?.role === 'TEACHER') && (
                                <button className="btn btn-icon btn-secondary" title="Fill Report" aria-label={`Fill report for ${s.name}`} onClick={() => handleOpenReport(s)}>
                                  <ClipboardEdit size={16} color="var(--primary)" />
                                </button>
                              )}
                              {/* Record Payment — ADMIN + ACCOUNTANT only */}
                              {(user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') && (
                                <button className="btn btn-icon btn-secondary" title="Record Payment" aria-label={`Record payment for ${s.name}`} onClick={() => { setPaymentStudent(s); setShowPaymentModal(true); }}>
                                  <Wallet size={16} color="var(--success)" />
                                </button>
                              )}
                              {/* Edit + Delete — ADMIN only */}
                              {user?.role === 'ADMIN' && (
                                <>
                                  <button className="btn btn-icon btn-secondary" title="Edit Student" aria-label={`Edit ${s.name}`} onClick={() => { setEditingStudent(s); setShowStudentModal(true); }}>
                                    <MoreVertical size={16} />
                                  </button>
                                  <button className="btn btn-icon btn-secondary" title="Delete Student" aria-label={`Delete ${s.name}`} style={{ color: 'var(--danger)' }} onClick={() => deleteStudent(s.id)}>
                                    <Trash size={16} />
                                  </button>
                                </>
                              )}
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...studentPagination} onPageChange={studentPagination.setPage} onPageSizeChange={studentPagination.setPageSize} />
              </section>
            } />

            {/* PAYMENTS — ADMIN + ACCOUNTANT only */}
            <Route path="/payments" element={
              <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']} userRole={user?.role}>
                <Payments
                  payments={filteredPayments}
                  setPayments={setPayments}
                  setDeleted={setDeleted}
                  currency={currencySymbol}
                  convertAmount={convertAmount}
                  backendUrl={CONFIG.backendUrl}
                  token={token}
                  schoolInfo={schoolInfo}
                  settings={settings}
                  userRole={user?.role}
                  syncWithBackend={syncWithBackend}
                  initialPeriod={paymentDateFilter}
                />
              </ProtectedRoute>
            } />

            {/* STAFF — ADMIN + ACCOUNTANT */}
            {(user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') && (
              <Route path="/staff" element={<Staff staff={staff} setStaff={setStaff} staffAttendance={staffAttendance} setStaffAttendance={setStaffAttendance} currency={currencySymbol} convertAmount={convertAmount} allClasses={allClasses} schoolInfo={schoolInfo} settings={settings} syncWithBackend={syncWithBackend} backendUrl={CONFIG.backendUrl} token={token} userRole={user?.role} />} />
            )}
            {/* ATTENDANCE — ADMIN + TEACHER */}
            {(user?.role === 'ADMIN' || user?.role === 'TEACHER') && (
              <Route path="/attendance" element={<Attendance students={students} attendanceData={attendance} onSave={saveAttendance} userRole={user?.role} assignedClass={user?.assignedClass} />} />
            )}


            {/* EXPENDITURE & FINANCE */}
            {(user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') && (
              <>
                <Route path="/expenditure" element={
                  <Expenditure 
                    expenditures={expenditures} 
                    onSave={saveExpenditure} 
                    currency={currencySymbol} 
                    schoolInfo={schoolInfo}
                    payments={filteredPayments}
                    attendanceData={attendance}
                    students={students}
                    feedingConfig={feedingConfig}
                    feedingRecords={feedingRecords}
                    termMetadata={{ academicYear: schoolInfo.academicYear, term: schoolInfo.term }}
                    backendUrl={CONFIG.backendUrl}
                    token={token}
                    currentUser={user?.name || user?.email || 'Admin'}
                  />
                } />
                <Route path="/feeding" element={
                  <Feeding 
                    students={students} 
                    classes={allClasses} 
                    feedingConfig={feedingConfig} 
                    onSave={saveFeedingRecord} 
                    feedingRecords={feedingRecords} 
                    onDelete={deleteFeedingRecord}
                    onUpdate={updateFeedingRecord}
                    currency={currencySymbol}
                    currentUser={user?.name || user?.email || 'Admin'}
                  />
                } />
              </>
            )}

            {/* REPORT EDITOR */}
            <Route path="/edit-report/:id" element={
              activeReport ? (
                <ReportEditor
                  key={(activeReport.student?.id || activeReport.targetDepartment) + (activeReport.reportData?.id || 'new')}
                  student={activeReport.student}
                  template={activeReport.template}
                  existingReport={activeReport.reportData}
                  onSave={handleSaveStudentReport}
                  onBack={() => navigate('/reports')}
                  term={schoolInfo.term}
                  academicYear={schoolInfo.academicYear}
                  settings={settings}
                  FEE_CONFIG={feeConfig}
                  departments={departments}
                  token={token}
                  backendUrl={CONFIG.backendUrl}
                  staff={staff}
                  isTemplateMode={activeReport.isTemplateMode}
                  targetDepartment={activeReport.targetDepartment}
                  attendanceData={attendance}
                  user={user}
                  onUpdateSettings={(newSettings) => setSettings(prev => ({ ...prev, ...newSettings }))}
                  schoolInfo={schoolInfo}
                />
              ) : <Navigate to="/reports" />
            } />

            <Route path="/bulk-print" element={
              selectedStudentIds.length > 0 ? (
                <div className="bulk-print-wrapper" style={{ background: '#f0f2f5', minHeight: '100vh' }}>
                  <div className="no-print glass-header p-4 flex justify-between items-center sticky top-0" style={{ zIndex: 1000, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)' }}>
                    <button className="btn btn-secondary flex-gap" onClick={() => { setSelectedStudentIds([]); navigate('/reports'); }}><ArrowLeft size={18} /> Exit Bulk Print</button>
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <h2 style={{ margin: 0 }}>Bulk Printing {selectedStudentIds.length} Reports</h2>
                      <div className="orientation-toggle no-print" style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '6px', gap: '2px', marginTop: '4px' }}>
                        <button className={`orientation-btn ${bulkOrientation === 'landscape' ? 'active' : ''}`} onClick={() => setBulkOrientation('landscape')} style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', background: bulkOrientation === 'landscape' ? 'white' : 'transparent', color: bulkOrientation === 'landscape' ? 'var(--accent)' : '#4a5568' }}>Landscape</button>
                        <button className={`orientation-btn ${bulkOrientation === 'portrait' ? 'active' : ''}`} onClick={() => setBulkOrientation('portrait')} style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', background: bulkOrientation === 'portrait' ? 'white' : 'transparent', color: bulkOrientation === 'portrait' ? 'var(--accent)' : '#4a5568' }}>Portrait</button>
                      </div>
                    </div>
                    <button className="btn btn-primary flex-gap" onClick={() => window.print()}>
                      <Printer size={18} /> START PRINTING
                    </button>
                  </div>
                  <div className="report-list" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {selectedStudentIds.map(id => {
                      const student = students.find(s => s.id === id);
                      const reportData = (reports || []).find(r => (r.studentId === student?.id || (r.studentId === undefined && (r.studentSid === student?.sid || r.studentName === student?.name))) && r.type === 'manual');
                      if (!student) return null;
                      return (
                        <div key={id} className="bulk-report-item" style={{ marginBottom: '50px' }}>
                          <ReportEditor
                            student={student}
                            template={null}
                            existingReport={reportData}
                            onSave={() => { }}
                            onBack={() => { }}
                            term={schoolInfo.term}
                            academicYear={schoolInfo.academicYear}
                            settings={{ ...settings, printColored }}
                            initialOrientation={bulkOrientation}
                            FEE_CONFIG={feeConfig}
                            departments={departments}
                            token={token}
                            backendUrl={CONFIG.backendUrl}
                            staff={staff}
                            isBulkMode={true}
                            attendanceData={attendance}
                            user={user}
                            onUpdateSettings={(newSettings) => setSettings(prev => ({ ...prev, ...newSettings }))}
                            schoolInfo={schoolInfo}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : <Navigate to="/reports" />
            } />

            {/* REPORT SETTINGS INTEGRATED INTO SETTINGS PAGE */}

            {user?.role !== 'ACCOUNTANT' && (
              <Route path="/reports" element={
                <ErrorBoundary name="Reports View">
                  <section className="view active reports-page-view">
                    <div className="flex-between mb-2 flex-wrap" style={{ gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                          <FileText size={18} aria-hidden="true" />
                        </div>
                        <div>
                          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>Report Cards</h1>
                          <p style={{ margin: '2px 0 0', fontSize: '11px', opacity: .6, fontWeight: 600 }}>{schoolInfo.term || 'TERM'} • {schoolInfo.academicYear || '—'} • {visibleReportRecordCount} of {visibleReportStudents.length} students completed</p>
                        </div>
                      </div>
                      <div className="flex-gap" style={{ alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto', justifyContent: 'flex-end' }}>
                        {selectedStudentIds.length > 0 && (
                          <div className="flex-gap flex-wrap" style={{ alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              background: 'var(--accent)',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              lineHeight: 1,
                              height: '32px'
                            }}>
                              {selectedStudentIds.length} Selected
                            </div>
                            <div className="flex-gap p-1" style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid var(--glass-border)', alignItems: 'center', height: '32px', padding: '0 8px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, height: '100%' }}>
                                <input type="checkbox" aria-label="Print selected reports in color" checked={printColored} onChange={e => setPrintColored(e.target.checked)} style={{ margin: 0 }} />
                                COLORED
                              </label>
                              <div style={{ width: '1px', height: '18px', background: 'var(--glass-border)', margin: '0 4px' }}></div>
                              <button className="btn btn-primary btn-sm" style={{ height: '26px', padding: '0 10px', fontSize: '10px' }} onClick={() => navigate('/bulk-print')}>
                                <Printer size={12} /> PRINT ALL
                              </button>
                            </div>
                          </div>
                        )}
                        {user?.role !== 'TEACHER' && (
                          <div className="form-group" style={{ margin: 0 }}>
                              <select
                                className="btn btn-secondary"
                                value={studentFilter}
                                onChange={(e) => setStudentFilter(e.target.value)}
                                style={{ 
                                  minWidth: '150px', 
                                  width: 'auto', 
                                  height: '36px', 
                                  fontSize: '12px', 
                                  textTransform: 'uppercase',
                                  padding: '0 30px 0 10px'
                                }}
                              >
                                <option value="">All Classes</option>
                              {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        )}
                        {user?.role === 'TEACHER' && (
                          <div className="btn btn-secondary" style={{ pointerEvents: 'none', height: '36px', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
                            Class: {user.assignedClass}
                          </div>
                        )}
                        <button className="btn btn-secondary flex-gap" style={{ 
                          height: '36px', 
                          padding: '0 15px', 
                          fontSize: '11px', 
                          fontWeight: 800,
                          borderColor: 'var(--accent-glow)'
                        }} onClick={exportClassReportsToExcel}>
                          <Download size={15} aria-hidden="true" /> Export Class Excel
                        </button>
                        <button className="btn btn-primary flex-gap" style={{ 
                          height: '36px', 
                          padding: '0 15px', 
                          fontSize: '11px', 
                          fontWeight: 800, 
                          minWidth: '150px', 
                          justifyContent: 'center' 
                        }} onClick={() => {
                          if (user?.role === 'TEACHER') {
                            navigate('/students');
                          } else {
                            setShowReportModal(true);
                          }
                        }}>
                          <Plus size={14} /> {user?.role === 'TEACHER' ? 'Fill Report' : 'Create Report'}
                        </button>
                      </div>
                    </div>

                    <div className="dashboard-kpi-grid mb-2">
                      <article className="dashboard-kpi-card tone-blue">
                        <span className="dashboard-kpi-icon"><FileText size={22} aria-hidden="true" /></span>
                        <span className="dashboard-kpi-copy">
                          <small>Total reports</small>
                          <strong>{visibleReportRecordCount}</strong>
                          <em>For the visible student selection</em>
                        </span>
                      </article>
                      <article className="dashboard-kpi-card tone-green">
                        <span className="dashboard-kpi-icon"><CheckCircle size={22} aria-hidden="true" /></span>
                        <span className="dashboard-kpi-copy">
                          <small>Completion</small>
                          <strong>{visibleReportStudents.length > 0 ? Math.round((completedVisibleReportCount / visibleReportStudents.length) * 100) : 0}%</strong>
                          <em>{completedVisibleReportCount} of {visibleReportStudents.length} visible students</em>
                        </span>
                      </article>
                    </div>

                    <div className="card" style={{ padding: '0', overflow: 'auto', marginTop: '8px' }}>
                      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center' }}>
                        <div className="search-bar" style={{
                          maxWidth: '350px',
                          flex: 1,
                          margin: 0,
                          padding: '0 12px',
                          borderRadius: '8px',
                          background: 'var(--bg-page)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          height: '34px'
                        }}>
                          <Search size={14} opacity={0.6} color="var(--accent)" style={{ flexShrink: 0 }} />
                          <input
                            type="text"
                            placeholder="Search name or ID..."
                            style={{
                              border: 'none',
                              background: 'transparent',
                              marginLeft: '8px',
                              fontSize: '12px',
                              width: '100%',
                              padding: '0',
                              height: '100%',
                              outline: 'none'
                            }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}>
                                <input
                                  type="checkbox"
                                  aria-label="Select all visible students"
                                  checked={visibleReportStudents.length > 0 && visibleReportStudents.every(s => selectedStudentIds.includes(s.id))}
                                  onChange={(e) => {
                                    const visibleIds = visibleReportStudents.map(s => s.id);
                                    if (e.target.checked) setSelectedStudentIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                                    else setSelectedStudentIds(prev => prev.filter(id => !visibleIds.includes(id)));
                                  }}
                                />
                              </th>
                              <th scope="col">Student</th>
                              <th scope="col">Class</th>
                              <th scope="col">Academic History</th>
                              <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportPagination.paginatedItems.map(s => {
                                const studentReports = (filteredReports || []).filter(r => r.studentId === s.id || (r.studentId === undefined && (r.studentSid === s.sid || r.studentName === s.name)));
                                return (
                                  <tr key={s.id} style={{ background: selectedStudentIds.includes(s.id) ? 'rgba(126, 34, 206, 0.05)' : 'transparent' }}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        aria-label={`Select ${s.name} for bulk report actions`}
                                        checked={selectedStudentIds.includes(s.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) setSelectedStudentIds(prev => [...prev, s.id]);
                                          else setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 700 }}>{s.name}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-main)' }}>ID: {s.sid}</div>
                                    </td>
                                    <td>{s.class}</td>
                                    <td>
                                      <div className="flex-gap" style={{ flexWrap: 'wrap' }}>
                                        {studentReports.length > 0 ? (
                                          studentReports.map(r => (
                                            <div key={r.id} className="flex-gap" title={`Added by: ${r.addedBy || 'Admin'}`} style={{ background: 'var(--bg-page)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '12px' }}>
                                              <span style={{ fontWeight: 600 }}>T{r.term}</span>
                                              <span style={{ color: 'var(--accent)' }}>{r.grade} ({r.total})</span>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteReport(r.id);
                                                }}
                                                style={{
                                                  background: 'rgba(239, 68, 68, 0.1)',
                                                  border: 'none',
                                                  padding: '2px',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  color: 'var(--danger)',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  transition: 'all 0.2s',
                                                  marginLeft: '4px'
                                                }}
                                                title="Delete Report"
                                                aria-label={`Delete ${s.name}'s term ${r.term} report`}
                                              >
                                                <X size={12} />
                                              </button>
                                            </div>
                                          ))
                                        ) : (
                                          <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>No reports found</span>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="flex-gap" style={{ justifyContent: 'flex-end' }}>
                                        <button
                                          className="btn btn-primary btn-sm flex-gap"
                                          title="Fill Digital Report"
                                          disabled={loadingReportId === s.id}
                                          onClick={() => handleOpenReport(s)}
                                        >
                                          {loadingReportId === s.id ? (
                                            <RotateCcw className="animate-spin" size={14} />
                                          ) : (
                                            <FileText size={14} />
                                          )}
                                          {loadingReportId === s.id ? 'LOADING...' : 'FILL REPORT'}
                                        </button>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            {visibleReportStudents.length === 0 && (
                              <tr>
                                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-main)' }}>
                                  <Users size={40} style={{ margin: '0 auto 10px', display: 'block' }} />
                                  {searchQuery || studentFilter ? 'No students match the current report filters.' : 'No students found.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <Pagination {...reportPagination} onPageChange={reportPagination.setPage} onPageSizeChange={reportPagination.setPageSize} />
                    </div>

                  </section>
                </ErrorBoundary>
              } />
            )}


            {user?.role === 'ADMIN' && (
              <Route path="/trash" element={
                <ErrorBoundary name="Trash View">
                  <section className="view active">
                    <div className="flex-between mb-1">
                      <h1>Recycle Bin</h1>
                      <div className="flex-gap">
                        <select
                          className="btn btn-outline"
                          style={{ width: 'auto' }}
                          value={trashCategory}
                          onChange={(e) => setTrashCategory(e.target.value)}
                        >
                          <option value="STUDENT">Deleted Students</option>
                          <option value="PAYMENT">Deleted Payments</option>
                        </select>
                        <button className="btn btn-secondary" onClick={async () => {
                          const toRestore = deleted.filter(item => item.type === trashCategory);
                          const results = await Promise.all(toRestore.map(restoreDeletedItem));
                          const count = results.filter(Boolean).length;
                          if (count) feedback.toast.success(`${count} item${count === 1 ? '' : 's'} restored.`);
                        }}><RotateCcw size={16} aria-hidden="true" /> Restore Category</button>
                        <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={async () => {
                          const categoryItems = deleted.filter(item => item.type === trashCategory);
                          if (!categoryItems.length || !await feedback.confirm({ title: 'Permanently empty category?', message: `${categoryItems.length} item${categoryItems.length === 1 ? '' : 's'} will be deleted and cannot be restored.`, confirmLabel: 'Delete permanently' })) return;
                          try {
                            await Promise.all(categoryItems.map(purgeDeletedItem));
                            feedback.toast.success('Recycle category emptied.');
                          } catch (error) { feedback.toast.error(error.message); }
                        }}><Trash2 size={16} aria-hidden="true" /> Empty Category</button>
                      </div>
                    </div>
                    <div className="card table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Details</th>
                            <th>Deleted Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(deleted) ? deleted : [])
                            .filter(item => item && item.type === trashCategory)
                            .map(item => (
                              <tr key={item.id}>
                                <td>{item.name || item.studentName || 'N/A'}</td>
                                <td>{item.class || `${currencySymbol}${item.amount || 0}`}</td>
                                <td>{item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                  <button className="btn btn-secondary" onClick={async () => {
                                    if (await restoreDeletedItem(item)) feedback.toast.success('Item restored.');
                                  }}><RotateCcw size={16} aria-hidden="true" /> Restore</button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </ErrorBoundary>
              } />
            )}

            {user?.role !== 'TEACHER' && (
              <Route path="/settings" element={
                <ErrorBoundary name="Settings View">
                  <section className="view active">
                    <div className="view-header">
                      <div>
                        <h1>System Settings</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Global configuration & branding controls</p>
                      </div>
                      <div className="tab-group" style={{ display: 'flex', gap: '8px', background: 'var(--bg-page)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        {[
                          { id: 'general', label: 'General', icon: Layout },
                          { id: 'finance', label: 'Finance', icon: Wallet },
                          { id: 'branding', label: 'Branding', icon: Palette },
                          { id: 'reports', label: 'Report Templates', icon: FileText },
                          { id: 'notifications', label: 'Alerts', icon: AlertCircle }
                        ].map(t => (
                          <button 
                            key={t.id} 
                            className={`btn ${activeSettingsTab === t.id ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveSettingsTab(t.id)}
                            style={{ 
                              fontSize: '11px', 
                              fontWeight: 800, 
                              textTransform: 'uppercase', 
                              height: '34px',
                              padding: '0 15px',
                              borderRadius: '8px',
                              boxShadow: activeSettingsTab === t.id ? 'var(--shadow-md)' : 'none'
                            }}
                          >
                            <t.icon size={14} style={{ marginRight: '6px' }} />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeSettingsTab === 'general' && (
                      <div className="grid-2 animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: '24px' }}>
                        <div className="card shadow-lg">
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><School size={20} aria-hidden="true" /> Academic Classes</h3>
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '15px' }}>Manage active classes. Adding/Removing here updates the entire school system.</p>
                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>List View (One per line)</label>
                            <textarea 
                              style={{ width: '100%', height: '200px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '13px', marginTop: '5px', background: 'var(--bg-page)' }}
                              placeholder="Type classes here, one per line..."
                              value={localClassesText}
                              onFocus={() => { isEditingClasses.current = true; }}
                              onChange={(e) => setLocalClassesText(e.target.value)}
                              onBlur={() => {
                                isEditingClasses.current = false;
                                const newArr = localClassesText.split('\n').map(s => s.trim().toUpperCase()).filter(Boolean);
                                if (JSON.stringify(newArr) !== JSON.stringify(allClasses)) {
                                  saveClasses(newArr);
                                }
                              }}
                            />
                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>Changes save automatically.</p>
                          </div>
                        </div>


                        <div className="card shadow-lg">
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={20} style={{ color: 'var(--accent)' }} /> 
                            General School Info
                          </h3>
                          <div className="form-group">
                            <label>Portal Display Name</label>
                            <input
                              type="text"
                              value={schoolInfo.schoolName}
                              onChange={e => setSchoolInfo({ ...schoolInfo, schoolName: e.target.value.toUpperCase() })}
                              onBlur={() => saveSchoolInfo()}
                              style={{ fontWeight: 700, fontSize: '15px' }}
                            />
                          </div>
                          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="form-group">
                              <label>Academic Period (Year)</label>
                              <input
                                type="text"
                                value={schoolInfo.academicYear}
                                onChange={e => setSchoolInfo({ ...schoolInfo, academicYear: e.target.value })}
                                onBlur={() => saveSchoolInfo()}
                                placeholder="e.g. 2024/2025"
                              />
                            </div>
                            <div className="form-group">
                              <label>Current Term</label>
                              <select
                                value={schoolInfo.term}
                                onChange={e => {
                                  const nextSchoolInfo = { ...schoolInfo, term: e.target.value };
                                  setSchoolInfo(nextSchoolInfo);
                                  saveSchoolInfo(nextSchoolInfo);
                                }}
                                className="btn-block"
                                style={{ height: '42px', padding: '0 12px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '12px' }}
                              >
                                <option>TERM 1</option>
                                <option>TERM 2</option>
                                <option>TERM 3</option>
                              </select>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>System Currency</label>
                            <select
                              value={currencyCode}
                              onChange={e => changeCurrency(e.target.value)}
                              className="btn-block"
                              style={{ height: '42px', padding: '0 12px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '12px' }}
                            >
                              {Object.keys(CURRENCY_SYMBOLS).map(code => (
                                <option key={code} value={code}>{code} ({CURRENCY_SYMBOLS[code]})</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Official School Start Time (Punctuality Policy)</label>
                            <input 
                              type="time"
                              value={settings.schoolStartTime || '08:00'}
                              onChange={e => setSettings({ ...settings, schoolStartTime: e.target.value })}
                              onBlur={() => syncWithBackend('settings', settings)}
                              style={{ fontWeight: 800 }}
                            />
                          </div>
                          <div className="mt-2" style={{ padding: '15px', background: 'var(--accent-glow)', borderRadius: '12px', border: '1px dashed var(--accent)' }}>
                            <p style={{ fontSize: '12px', margin: 0, color: 'var(--text-main)', lineHeight: 1.5 }}>
                              <strong>Pro Tip:</strong> Updates to school information will reflect on all generated PDFs and Receipts instantly.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === 'finance' && (
                      <div className="grid-2 animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', padding: '10px', alignItems: 'start' }}>
                        <div className="card shadow-lg" style={{ maxWidth: '800px', height: 'fit-content', background: '#fff' }}>
                          <div className="flex-between mb-2">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wallet size={20} aria-hidden="true" /> Fee & Feeding Configuration</h3>
                            <div className="flex-gap" style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-main)' }}>
                              <span style={{ width: '100px', textAlign: 'center' }}>Term Fee</span>
                              <span style={{ width: '100px', textAlign: 'center' }}>Feeding/Day</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
                            {allClasses.filter(c => c && c.trim()).map((cls) => (
                              <div key={cls} className="flex-between" style={{ padding: '12px', background: 'var(--bg-page)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <strong style={{ fontSize: '13px' }}>{cls}</strong>
                                <div className="flex-gap">
                                  <div style={{ position: 'relative' }}>
                                    <input
                                      type="number"
                                      value={feeConfig[cls] || 0}
                                      onChange={(e) => setFeeConfig({ ...feeConfig, [cls]: parseInt(e.target.value) || 0 })}
                                      onBlur={() => syncWithBackend('feeConfig', feeConfig)}
                                      style={{ width: '100px', padding: '8px 12px', textAlign: 'right', borderRadius: '10px', border: '1.5px solid var(--border)', fontWeight: 800, fontSize: '14px' }}
                                    />
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-main)' }}>{currencySymbol}</span>
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <input
                                      type="number"
                                      value={feedingConfig[cls] || 0}
                                      onChange={(e) => setFeedingConfig({ ...feedingConfig, [cls]: parseInt(e.target.value) || 0 })}
                                      onBlur={() => syncWithBackend('feedingConfig', feedingConfig)}
                                      style={{ width: '100px', padding: '8px 12px', textAlign: 'right', borderRadius: '10px', border: '1.5px solid var(--accent)', background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800, fontSize: '14px' }}
                                    />
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--accent)' }}>{currencySymbol}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === 'branding' && (
                      <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div className="card shadow-lg">
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Palette size={20} aria-hidden="true" /> Digital Assets</h3>
                          <div className="form-group mt-2">
                             <label style={{ fontSize: '11px', fontWeight: 800 }}>Primary School Logo</label>
                             <div className="flex-between" style={{ padding: '15px', background: 'var(--bg-page)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                               <img src={settings.logoUrl || '/logo.png'} style={{ width: '40px', height: '40px', borderRadius: '6px' }} />
                               <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('logo-upload-tab').click()}>Change</button>
                               <input type="file" id="logo-upload-tab" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'logo')} />
                             </div>
                          </div>
                          <div className="form-group mt-2">
                             <label style={{ fontSize: '11px', fontWeight: 800 }}>Accountant Signature</label>
                             <div 
                                onClick={() => document.getElementById('sig-upload-tab').click()}
                                style={{ padding: '20px', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }}
                             >
                                {settings.accountantSignatureUrl ? <img src={settings.accountantSignatureUrl} style={{ height: '40px', filter: theme === 'dark' ? 'invert(1)' : 'none' }} /> : 'Click to Upload'}
                                <input type="file" id="sig-upload-tab" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'accountantSignature')} />
                             </div>
                          </div>
                          <div className="form-group mt-2">
                             <label style={{ fontSize: '11px', fontWeight: 800 }}>Head of School Signature</label>
                             <div 
                                onClick={() => document.getElementById('head-sig-upload-tab').click()}
                                style={{ padding: '20px', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }}
                             >
                                {settings.headSignatureUrl ? <img src={settings.headSignatureUrl} style={{ height: '40px', filter: theme === 'dark' ? 'invert(1)' : 'none' }} /> : 'Click to Upload'}
                                <input type="file" id="head-sig-upload-tab" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'headSignature')} />
                             </div>
                          </div>
                        </div>
                        <div className="card shadow-lg">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Palette size={20} aria-hidden="true" /> Digital Assets (Cont.)</h3>
                           <div className="form-group mt-2">
                             <label style={{ fontSize: '11px', fontWeight: 800 }}>Preschool Head Signature</label>
                             <div 
                                onClick={() => document.getElementById('pre-sig-upload-tab').click()}
                                style={{ padding: '20px', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }}
                             >
                                {settings.preschoolHeadSignatureUrl ? <img src={settings.preschoolHeadSignatureUrl} style={{ height: '40px', filter: theme === 'dark' ? 'invert(1)' : 'none' }} /> : 'Click to Upload'}
                                <input type="file" id="pre-sig-upload-tab" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files[0], 'preschoolHeadSignature')} />
                             </div>
                          </div>
                           <div style={{ marginTop: '20px' }}>
                             <BrandingSettings syncWithBackend={syncWithBackend} />
                           </div>
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === 'reports' && (
                      <ReportTemplateSettings
                        backendUrl={CONFIG.backendUrl}
                        token={token}
                        departments={departments}
                        reportTemplates={reportTemplates}
                        setReportTemplates={setReportTemplates}
                      />
                    )}

                    {activeSettingsTab === 'notifications' && (
                       <div className="card shadow-lg animate-fade-in">
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bell size={20} aria-hidden="true" /> SMS Configuration</h3>
                          <p>Manage your automated messaging gateways.</p>
                          <div className="flex-between mt-2" style={{ padding: '20px', background: 'var(--bg-page)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                             <span>Enable SMS Alerts</span>
                             <button className={`btn ${smsEnabled ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSmsEnabled(!smsEnabled)}>{smsEnabled ? 'ENABLED' : 'DISABLED'}</button>
                          </div>
                       </div>
                    )}
                  </section>

                </ErrorBoundary>
              } />
            )}

            {/* ACCESS DENIED */}
            <Route path="/access-denied" element={
              <section className="view active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '40px' }}>
                <div style={{ marginBottom: '24px', filter: 'drop-shadow(0 4px 12px rgba(239,68,68,0.3))' }}><LockKeyhole size={64} aria-hidden="true" /></div>
                <h1 style={{ color: 'var(--danger)', margin: '0 0 12px', fontSize: '2rem' }}>Access Denied</h1>
                <p style={{ color: 'var(--text-main)', marginBottom: '8px', maxWidth: '420px', lineHeight: 1.6 }}>
                  Your account role <strong style={{ color: user?.role === 'ADMIN' ? '#ef4444' : user?.role === 'ACCOUNTANT' ? '#22c55e' : '#a855f7' }}>({user?.role})</strong> does not have permission to view this page.
                </p>
                <p style={{ color: 'var(--text-main)', fontSize: '13px', marginBottom: '28px' }}>Contact your administrator if you believe this is an error.</p>
                <Link
                  to={user?.role === 'TEACHER' ? '/students' : '/'}
                  className="btn btn-primary"
                  style={{ padding: '12px 28px', fontWeight: 700, fontSize: '15px' }}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Go to {user?.role === 'TEACHER' ? 'Students' : 'Dashboard'}
                </Link>
              </section>
            } />

            <Route path="*" element={<section className="view active"><h1>404</h1><p>Page not found or access restricted.</p></section>} />
            <Route path="/access" element={
              user?.role === 'ADMIN' ? (
                <section className="view active">
                  <div className="view-header">
                    <h1>System Access & User Management</h1>
                  </div>

                  {/* Pending Activations & Recovery Requests Section */}
                  <div className="card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <ShieldCheck size={20} style={{ color: 'var(--accent)' }} />
                        Pending Activations & Recovery Requests
                      </h3>
                      {(() => { const pending=(users||[]).filter(u=>u.password_recovery_requested===true || ['pending','pending_activation'].includes((u.status||'').toLowerCase())); return pending.length>0 && (
                        <span className="badge" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                          {pending.length} Action Required
                        </span>
                      )})()}
                    </div>

                    {(() => { const pending=(users||[]).filter(u=>u.password_recovery_requested===true || ['pending','pending_activation'].includes((u.status||'').toLowerCase())); return pending.length===0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                        <ShieldCheck size={48} style={{ color: '#22c55e', marginBottom: '12px' }} />
                        <p style={{ fontWeight: 600, fontSize: '15px', color: '#22c55e', margin: 0 }}>All Accounts Secure & Active</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '4px', margin: 0 }}>There are no pending activation or recovery requests at this time.</p>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Assigned Class</th>
                              <th>Status / Issue</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => { const pending=(users||[]).filter(u=>u.password_recovery_requested===true || ['pending','pending_activation'].includes((u.status||'').toLowerCase())); return pending.map(u => (
                              <tr key={u.email}>
                                <td><strong>{u.name}</strong></td>
                                <td>{u.email}</td>
                                <td>
                                  <span className="badge" style={{
                                    background: u.role === 'ADMIN' ? 'rgba(239,68,68,0.1)' : u.role === 'ACCOUNTANT' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                                    color: u.role === 'ADMIN' ? '#ef4444' : u.role === 'ACCOUNTANT' ? '#22c55e' : '#a855f7',
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700
                                  }}>{u.role}</span>
                                </td>
                                <td>{u.assignedClass || 'N/A'}</td>
                                <td>
                                  {u.password_recovery_requested === true ? (
                                    <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                      <AlertTriangle size={13} aria-hidden="true" /> Password Recovery
                                    </span>
                                  ) : (
                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                      <Clock3 size={13} aria-hidden="true" /> Pending Activation
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn btn-secondary"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '12px',
                                      padding: '6px 12px',
                                      border: '1px solid rgba(34,197,94,0.4)',
                                      background: 'rgba(34,197,94,0.05)',
                                      color: '#22c55e',
                                      fontWeight: 600,
                                      borderRadius: '6px'
                                    }}
                                    onClick={() => handleActivateUser(u)}
                                  >
                                    <ShieldCheck size={14} /> Activate & Reset Password
                                  </button>
                                </td>
                              </tr>
                            ))})()}
                          </tbody>
                        </table>
                      </div>
                    )})()}
                  </div>

                  <AccessManagementExtras backendUrl={CONFIG.backendUrl} token={token} classes={allClasses} />

                  <div className="grid-2">
                    <div className="card">
                      <h3>Registered Users</h3>
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map(u => {
                              const isPending = ['pending','pending_activation'].includes((u.status||'').toLowerCase());
                              return (
                              <tr key={u.email} style={isPending ? { background: 'rgba(249,115,22,0.04)' } : undefined}>
                                <td>{u.name}</td>
                                <td>{u.email}</td>
                                <td>
                                  <span className="badge" style={{
                                    background: u.role === 'ADMIN' ? 'rgba(239,68,68,0.1)' : u.role === 'ACCOUNTANT' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                                    color: u.role === 'ADMIN' ? '#ef4444' : u.role === 'ACCOUNTANT' ? '#22c55e' : '#a855f7',
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700
                                  }}>{u.role}</span>
                                </td>
                                <td>{isPending ? <span className="badge" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}><Clock3 size={11} style={{ marginRight: 4 }} />Pending</span> : <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Active</span>}</td>
                                <td style={{ textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  {isPending && (
                                    <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }} onClick={() => handleActivateUser(u)}><ShieldCheck size={12} /> Activate</button>
                                  )}
                                  {u.email !== 'admin@school.com' && u.email !== user.email && (
                                    <button className="btn btn-icon btn-secondary" aria-label={`Remove user ${u.name}`} style={{ color: 'var(--danger)' }} onClick={() => {
                                      setUserToDelete(u);
                                      setShowDeletionModal(true);
                                    }}>
                                      <Trash size={16} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="card">
                      <h3>Activity Log (Logins & Signups)</h3>
                      <div className="table-responsive" style={{ maxHeight: '500px' }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>User Info</th>
                              <th>Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...activityLog].reverse().map((log, idx) => (
                              <tr key={idx}>
                                <td>
                                  <span style={{
                                    color: log.type === 'LOGIN' ? 'var(--success)' : 'var(--accent)',
                                    fontWeight: 800, fontSize: '11px'
                                  }}>{log.type}</span>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{log.name}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-main)' }}>{log.email}</div>
                                </td>
                                <td style={{ fontSize: '11px', color: 'var(--text-main)' }}>{log.time}</td>
                              </tr>
                            ))}
                            {activityLog.length === 0 && (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-main)', padding: '20px' }}>No activity logged yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              ) : <Navigate to="/" />
            } />



            {/* Duplicate /edit-report/:studentId route removed — use /edit-report/:id above */}
          </Routes>
          </Suspense>
        </div>
      </main>

      {/* Modals */}
      {showProfileModal && (
        <StudentProfile
          student={selectedProfile}
          onClose={() => setShowProfileModal(false)}
          onEdit={(s) => { setEditingStudent(s); setShowStudentModal(true); }}
          currency={currencySymbol}
          getTermFee={getTermFee}
          payments={user?.role === 'TEACHER' ? filteredPayments : payments}
          onQuickPay={async (amount) => {
            await handleProcessPayment(selectedProfile.id, amount);
            setShowProfileModal(false);
          }}
          onUpdatePhoto={handleUpdateStudentPhoto}
          userRole={user?.role}
        />
      )}

      {showStudentModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="student-modal-title" style={{ maxWidth: '500px', width: '95%', padding: '20px' }}>
            <div className="flex-between mb-4">
              <h2 id="student-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{editingStudent ? 'Edit Student Details' : 'New Student Enrollment'}</h2>
              <button type="button" className="btn btn-icon btn-secondary" aria-label="Close student dialog" onClick={() => { setEditingStudent(null); setShowStudentModal(false); }}><X size={18} aria-hidden="true" /></button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const data = Object.fromEntries(formData.entries());
              addOrUpdateStudent(data);
            }} style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label htmlFor="student-name" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Full Name *</label>
                  <input id="student-name" type="text" name="name" defaultValue={editingStudent?.name} placeholder="e.g. JOHN DOE" required style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-id" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Student ID</label>
                  <input id="student-id" type="text" name="sid" defaultValue={editingStudent?.sid} placeholder="Auto-gen if blank" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-class" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Assigned Class *</label>
                  <select id="student-class" name="class" defaultValue={editingStudent?.class || (allClasses[0] || '')} required style={{ padding: '10px' }}>
                    {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-gender" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Gender *</label>
                  <select id="student-gender" name="gender" defaultValue={editingStudent?.gender || 'M'} required style={{ padding: '10px' }}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-contact" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Parent Contact *</label>
                  <input id="student-contact" type="text" name="contact" defaultValue={editingStudent?.contact || editingStudent?.parentPhone} placeholder="024-XXXX-XXX" required style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-dob" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Date of Birth</label>
                  <input id="student-dob" type="date" name="dob" defaultValue={editingStudent?.dob} style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: 'calc(50% - 6px)', marginBottom: 0 }}>
                  <label htmlFor="student-residence" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Residence</label>
                  <input id="student-residence" type="text" name="residence" defaultValue={editingStudent?.residence} placeholder="Street / Town" style={{ padding: '10px' }} />
                </div>

                <div className="form-group" style={{ width: '100%', marginBottom: 0 }}>
                  <label htmlFor="student-medical" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>Medical Condition (If Any)</label>
                  <textarea id="student-medical" name="medical" defaultValue={editingStudent?.medical} placeholder="e.g. Asthma, or None" rows="1" style={{ padding: '10px' }}></textarea>
                </div>

                <div style={{ width: '100%', padding: '12px', background: 'var(--accent-glow)', borderRadius: '12px', border: '1.5px solid var(--accent)', marginTop: '4px' }}>
                  <label style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Fee Adjustments</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="student-discount-type" style={{ fontSize: '10px', color: 'var(--text-main)' }}>Discount</label>
                      <select id="student-discount-type" name="discountType" defaultValue={editingStudent?.discountType || 'none'} style={{ padding: '8px', fontSize: '12px' }}>
                        <option value="none">None</option>
                        <option value="partial">Partial</option>
                        <option value="full">Full</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="student-discount-value" style={{ fontSize: '10px', color: 'var(--text-main)' }}>Discount Amount</label>
                      <input id="student-discount-value" type="number" name="discountValue" min="0" step="0.01" defaultValue={editingStudent?.discountValue || 0} style={{ padding: '8px', fontSize: '12px' }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="student-prev-arrears" style={{ fontSize: '10px', color: 'var(--text-main)' }}>Prev Arrears</label>
                      <input id="student-prev-arrears" type="number" name="prevArrears" defaultValue={editingStudent?.prevArrears || 0} step="0.01" style={{ padding: '8px', fontSize: '12px' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => { setEditingStudent(null); setShowStudentModal(false); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px' }}>{editingStudent ? 'UPDATE' : 'ENROLL'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="bulk-student-modal-title">
            <h2 id="bulk-student-modal-title">Bulk Add Students</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Paste names below (one name per line). They will be added to the selected class.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const text = e.target.names.value;
              const cls = e.target.targetClass.value;
              handleBulkAdd(text, cls);
            }}>
              <div className="form-group">
                <label htmlFor="bulk-student-names">Paste Student Names</label>
                <textarea
                  id="bulk-student-names"
                  name="names"
                  rows="10"
                  placeholder="FORMAT: Name, Arrears, Contact&#10;John Doe, 500, 0240000000&#10;Jane Smith, 0, 0551112222"
                  required
                ></textarea>
              </div>
              <div className="form-group">
                <label htmlFor="bulk-student-class">Target Class</label>
                <select id="bulk-student-class" name="targetClass" className="btn btn-secondary" style={{ width: '100%' }}>
                  {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Process and Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && <PaymentModal
        onClose={() => { setShowPaymentModal(false); setPaymentStudent(null); }}
        onSave={async (data) => {
          const saved = await handleProcessPayment(data.studentId, data.amount, data.method);
          if (saved) {
            setShowPaymentModal(false);
            setPaymentStudent(null);
          }
          return saved;
        }}
        students={
          ['ADMIN', 'ACCOUNTANT'].includes((user?.role || '').toUpperCase())
            ? students.filter(s => (studentBalances[s.sid]?.balance || 0) > 0)
            : filteredStudents.filter(s => (studentBalances[s.sid]?.balance || 0) > 0)
        }
        currency={currencySymbol}
        payments={['ADMIN', 'ACCOUNTANT'].includes((user?.role || '').toUpperCase()) ? payments : filteredPayments}
        calculateStudentFees={calculateStudentFees}
        initialStudent={paymentStudent}
      />}

      {showRegisterModal && (
        <StudentRegisterModal
          show={showRegisterModal}
          onClose={() => setShowRegisterModal(false)}
          students={displayStudents}
          studentBalances={studentBalances}
          schoolInfo={schoolInfo}
          settings={settings}
          studentFilter={studentFilter}
          genderFilter={genderFilter}
          arrearsFilter={arrearsFilter}
          searchQuery={searchQuery}
          currencySymbol={currencySymbol}
          convertAmount={convertAmount}
          exportToExcel={exportToExcel}
          exportToCSV={exportToCSV}
        />
      )}

      {showReportModal && <ReportModal
        departments={departments}
        setActiveReport={setActiveReport}
        navigate={navigate}
        onClose={() => { setShowReportModal(false); setPaymentStudent(null); }}
        onSave={async (data) => {
          const sList = user?.role === 'TEACHER' ? filteredStudents : students;
          const student = sList.find(s => s.id === data.studentId);
          if (!student) return;

          const requestId = createRequestId('report');
          const newReport = {
            id: requestId,
            requestId,
            studentSid: student.sid,
            studentName: student.name,
            studentClass: student.class,
            term: data.term,
            type: data.type,
            addedBy: user?.name || 'Admin',
            date: new Date().toISOString(),
            ...(data.type === 'manual' ? {
              assign: data.assign,
              exam: data.exam,
              total: (parseFloat(data.assign) || 0) + (parseFloat(data.exam) || 0)
            } : {
              fileData: data.fileData,
              fileName: data.fileName
            })
          };

          if (data.type === 'manual') {
            const total = parseFloat(data.assign) + parseFloat(data.exam);
            const grade = total >= 90 ? 'A+' : total >= 80 ? 'A' : total >= 70 ? 'B' : total >= 60 ? 'C' : total >= 50 ? 'D' : 'F';
            newReport.total = total;
            newReport.grade = grade;
          } else {
            newReport.fileData = data.fileData;
            newReport.fileName = data.fileName;
            newReport.total = '--';
            newReport.grade = 'FILE';
          }

          setReports(prev => [...prev, newReport]);
          try {
            const savedReport = await saveReportRecord(newReport);
            setReports(prev => prev.map(report => report.id === newReport.id ? savedReport : report));
            setShowReportModal(false);
            setPaymentStudent(null);
            return true;
          } catch (error) {
            setReports(prev => prev.filter(report => report.id !== newReport.id));
            feedback.toast.error(error.message);
            return false;
          }
        }}
        students={user?.role === 'TEACHER' ? filteredStudents : students}
        initialStudentId={paymentStudent?.id}
      />
      }

      {showReminderModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="reminder-modal-title" style={{ maxWidth: '500px', width: '95%' }}>
            <div className="flex-between mb-1">
              <h2 id="reminder-modal-title" style={{ marginBottom: 0 }}>Review Reminders</h2>
              <button type="button" className="btn btn-icon btn-secondary" aria-label="Close reminder dialog" onClick={() => setShowReminderModal(false)}><X size={18} aria-hidden="true" /></button>
            </div>

            <div className="mb-2">
              <label htmlFor="reminder-message" style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>
                <Pencil size={14} aria-hidden="true" /> Reminder Message — edit freely
              </label>
              <textarea
                id="reminder-message"
                value={reminderNote}
                onChange={e => {
                  setReminderNote(e.target.value);
                  localStorage.setItem('erp_reminder_note', e.target.value);
                }}
                rows={4}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--accent)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-main)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  outline: 'none',
                  boxShadow: '0 0 0 3px var(--accent-glow)',
                }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Lightbulb size={13} aria-hidden="true" /> Your edits are saved automatically and will be used for all reminders sent.</p>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--accent-glow)', borderRadius: '12px' }}>
              {(user?.role === 'TEACHER' ? filteredStudents : students)
                .map(s => {
                  const totalPaid = payments
                    .filter(p => p.studentName === s.name && p.studentClass === s.class)
                    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                  const fees = calculateStudentFees(s);
                  const totalExpected = fees.totalDue;
                  return { ...s, balance: totalExpected - totalPaid };
                })
                .filter(s => s.balance > 0)
                .map(s => (
                  <div key={s.id} style={{ padding: '12px', borderBottom: '1px solid var(--accent-glow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: '15px' }}>{s.name}</p>
                      <p style={{ fontSize: '13px', color: 'var(--text-main)', margin: '2px 0' }}>
                        Parent Contact: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.contact || 'N/A'}</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: 'var(--danger)', fontWeight: 800, margin: 0, fontSize: '15px' }}>{currencySymbol}{s.balance.toLocaleString()}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', margin: 0 }}>{s.class}</p>
                    </div>
                  </div>
                ))
              }
              {(user?.role === 'TEACHER' ? filteredStudents : students).filter(s => {
                const paid = payments.filter(p => p.studentName === s.name && p.studentClass === s.class).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                const fees = calculateStudentFees(s);
                const expected = fees.totalDue;
                return (expected - paid) > 0;
              }).length === 0 && (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-main)' }}>
                    <CheckCircle size={40} style={{ margin: '0 auto 12px', color: 'var(--success)' }} />
                    <p style={{ fontWeight: 600 }}>No outstanding balances found!</p>
                    <p style={{ fontSize: '12px' }}>All students have fully cleared their fees.</p>
                  </div>
                )}
            </div>

            <div className="modal-actions mt-2">
              <button className="btn btn-secondary" onClick={() => setShowReminderModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                const list = (user?.role === 'TEACHER' ? filteredStudents : students).filter(s => {
                  const paid = payments.filter(p => p.studentName === s.name && p.studentClass === s.class).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                  const fees = calculateStudentFees(s);
                  const expected = fees.totalDue;
                  return expected - paid > 0;
                });
                if (list.length === 0) return alert("No students with arrears found.");

                alert(`Reminder batch for ${list.length} students processed successfully!`);
                setShowReminderModal(false);
              }}>Confirm Bulk Send</button>
            </div>
          </div>
        </div>
      )}

      {activeReceipt && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="receipt-modal-title" style={{ maxWidth: '750px', width: '95%', padding: 0, overflow: 'hidden' }}>
            {/* The Slip Visual - Landscape Style */}
            <div id="receipt-slip" style={{ padding: '40px', background: '#fff', color: '#000', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <img src={settings.logoUrl || "/logo.png"} alt="School logo" style={{ width: '80px', height: '80px', borderRadius: '12px' }} onError={(e) => e.target.style.display = 'none'} />
                <h2 style={{ margin: '10px 0 0 0', fontSize: '24px', color: '#7e22ce', fontWeight: 800 }}>{schoolInfo.schoolName}</h2>
                <p style={{ fontSize: '11px', margin: '5px 0', color: 'var(--text-main)', fontWeight: 600, letterSpacing: '1px' }}>EXCELLENCE IN EDUCATION & CHARACTER</p>
              </div>

              <div style={{ height: '2px', background: '#eee', margin: '10px 0 25px 0' }}></div>

              <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                <h3 id="receipt-modal-title" style={{ fontSize: '16px', fontWeight: 800, margin: 0, textDecoration: 'underline' }}>OFFICIAL PAYMENT RECEIPT</h3>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '13px' }}>
                <div>
                  <strong>Receipt Code:</strong> {activeReceipt.receiptCode}<br />
                  <strong>Student:</strong> <span style={{ textTransform: 'uppercase' }}>{activeReceipt.studentName}</span><br />
                  <strong>Class:</strong> {activeReceipt.studentClass}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>Date:</strong> {activeReceipt.date}<br />
                  <strong>Academic Year:</strong> {schoolInfo.academicYear}<br />
                  <strong>Term:</strong> {schoolInfo.term}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                <thead>
                  <tr style={{ background: '#7e22ce', color: '#fff' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', borderRadius: '4px 0 0 4px' }}>Description</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', borderRadius: '0 4px 4px 0' }}>Amount ({currencySymbol})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 10px', fontSize: '14px' }}>Student Name</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '14px', fontWeight: 700 }}>{activeReceipt.studentName}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 10px', fontSize: '14px' }}>Class</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '14px', fontWeight: 700 }}>{activeReceipt.studentClass}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 10px', fontSize: '14px' }}>Amount Paid</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '18px', fontWeight: 800, color: '#10b981' }}>{currencySymbol} {convertAmount(activeReceipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee', background: 'rgba(239, 68, 68, 0.05)' }}>
                    <td style={{ padding: '12px 10px', fontSize: '15px', fontWeight: 900, color: '#ef4444' }}>OUTSTANDING BALANCE</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '18px', fontWeight: 900, color: '#ef4444' }}>{currencySymbol} {convertAmount(activeReceipt.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 10px', fontSize: '14px' }}>Payment Method</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '14px' }}>Cash/Transfer</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '30px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontStyle: 'italic', color: 'var(--text-main)' }}>
                  "Thank you for your prompt payment. Keep this receipt for your records."
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '20px', background: 'var(--bg-page)', borderTop: '1px solid var(--border-color)' }}>
              <div className="flex-grow">
                <select className="form-select" aria-label="Receipt paper size" value={receiptPaperSize} onChange={(e) => setReceiptPaperSize(e.target.value)}>
                  <option value="A5">A5 (Single Landscape)</option>
                  <option value="A4-DOUBLE">A4 (Two Receipts per Page)</option>
                  <option value="A4-QUAD">A4 (Four Receipts per Page - 2x2)</option>
                </select>
              </div>
              <button className="btn btn-secondary" onClick={() => setActiveReceipt(null)}>Close</button>
              <button className="btn btn-secondary" onClick={() => {
                const slip = document.getElementById('receipt-slip');
                const win = window.open('', '', 'width=1000,height=800');
                const isDouble = receiptPaperSize === 'A4-DOUBLE';
                const isQuad = receiptPaperSize === 'A4-QUAD';

                win.document.write(`
                  <html>
                    <head>
                      <title>Print Receipt - ${activeReceipt.receiptCode}</title>
                      <style>
                        @page { size: ${isDouble || isQuad ? 'portrait' : 'landscape'}; margin: 0; }
                        body { font-family: sans-serif; margin: 0; padding: 0; }
                        
                        .grid-container {
                          display: grid;
                          grid-template-columns: ${isQuad ? '210mm' : '100%'};
                          grid-template-rows: ${isQuad ? '297mm' : '100%'};
                          width: 100%;
                          height: 100%;
                        }
                        
                        .print-grid {
                          display: grid;
                          grid-template-columns: ${isQuad ? '1fr 1fr' : '1fr'};
                          grid-template-rows: ${isQuad ? '1fr 1fr' : (isDouble ? '1fr 1fr' : '1fr')};
                          width: 210mm;
                          height: 297mm;
                          box-sizing: border-box;
                        }
                        
                        .receipt-cell {
                          border: 1px solid #ddd;
                          padding: 10mm;
                          box-sizing: border-box;
                          display: flex;
                          flex-direction: column;
                          justify-content: center;
                          overflow: hidden;
                          height: ${isQuad || isDouble ? '148.5mm' : '100%'};
                          width: ${isQuad ? '105mm' : '100%'};
                        }

                        /* Ensure slip styles are maintained in cells */
                        .receipt-cell > div { width: 100%; }
                      </style>
                    </head>
                    <body>
                      <div class="print-grid">
                        <div class="receipt-cell">${slip.innerHTML}</div>
                        ${(isDouble || isQuad) ? '<div class="receipt-cell">' + slip.innerHTML + '</div>' : ''}
                        ${isQuad ? '<div class="receipt-cell">' + slip.innerHTML + '</div>' : ''}
                        ${isQuad ? '<div class="receipt-cell">' + slip.innerHTML + '</div>' : ''}
                      </div>
                      <script>
                        setTimeout(() => {
                          window.print();
                          window.close();
                        }, 500);
                      </script>
                    </body>
                  </html>
                `);
                win.document.close();
              }}>Print Directly</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { generateReceipt(activeReceipt, true, receiptPaperSize); setActiveReceipt(null); }}>Download PDF</button>
            </div>
          </div>
        </div>
      )}
      {showActivationModal && (
        <ActivationModal
          user={pendingActivationUser}
          onClose={() => { setShowActivationModal(false); setPendingActivationUser(null); }}
          onConfirm={processUserActivation}
        />
      )}

      {showDeletionModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="deletion-modal-title" style={{ maxWidth: '500px', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', marginBottom: '16px' }}><Trash size={48} /></div>
            <h2 id="deletion-modal-title">Confirm Deletion</h2>
            <p>Are you sure you want to remove <strong>{userToDelete?.name}</strong>?</p>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '8px' }}>This will permanently revoke their access to the system.</p>

            <div className="modal-actions mt-2">
              <button className="btn btn-secondary" onClick={() => { setShowDeletionModal(false); setUserToDelete(null); }}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', flex: 1 }} onClick={async () => {
                setIsLoading(true);
                const success = await syncWithBackend('users', null, 'delete', userToDelete.email);
                if (success) {
                  setUsers(prev => prev.filter(usr => usr.email !== userToDelete.email));
                  alert("User removed successfully.");
                } else {
                  alert("Failed to remove user. Access denied.");
                }
                setIsLoading(false);
                setShowDeletionModal(false);
                setUserToDelete(null);
              }}>Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentModal({ onClose, onSave, students, currency, payments, calculateStudentFees, initialStudent }) {
  const [formData, setFormData] = useState({
    studentId: initialStudent ? initialStudent.id : '',
    amount: '',
    method: 'Cash'
  });
  const lastAutoFilledStudentRef = React.useRef(null);

  const selectedStudent = useMemo(() =>
    students.find(s => s.id === formData.studentId),
    [formData.studentId, students]
  );

  const summary = useMemo(() => {
    if (!selectedStudent) return { paid: 0, balance: 0, total: 0 };
    const paid = payments
      .filter(p => p.studentSid === selectedStudent.sid || (p.studentName === selectedStudent.name && p.studentClass === selectedStudent.class))
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const fees = calculateStudentFees(selectedStudent);
    const total = fees.totalDue;
    return { paid, balance: Math.max(0, total - paid), total };
  }, [selectedStudent, payments, calculateStudentFees]);

  const remainingAfter = useMemo(() => {
    const amt = parseFloat(formData.amount) || 0;
    return Math.max(0, summary.balance - amt);
  }, [summary.balance, formData.amount]);

  const amountValue = Number(formData.amount);
  const isPaymentValid = Boolean(selectedStudent) && amountValue > 0 && amountValue <= Math.max(0, summary.balance);

  useEffect(() => {
    if (selectedStudent && lastAutoFilledStudentRef.current !== selectedStudent.id) {
      lastAutoFilledStudentRef.current = selectedStudent.id;
      setFormData(prev => ({
        ...prev,
        studentId: selectedStudent.id,
        amount: Math.max(0, summary.balance)
      }));
    }
  }, [selectedStudent, summary.balance]);

  return (
    <div className='modal' role='presentation'>
      <div className='modal-content card' role='dialog' aria-modal='true' aria-labelledby='payment-modal-title' style={{ maxWidth: '500px', width: '95%' }}>
        <div className='flex-between mb-4'>
          <h2 id='payment-modal-title' style={{ fontSize: '20px', fontWeight: 900, marginBottom: 0 }}>Record Payment</h2>
          <button className='btn btn-icon btn-secondary' aria-label='Close payment dialog' onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>

        {selectedStudent && (
          <div id='pay-student-summary' className='mb-6' style={{ 
            background: 'var(--accent-glow)', 
            padding: '20px', 
            borderRadius: '16px', 
            border: '1.5px solid var(--accent)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Term Commitment</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)' }}>{currency}{summary.total.toLocaleString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Previously Paid</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--success)' }}>{currency}{summary.paid.toLocaleString()}</p>
              </div>
              <div style={{ 
                borderTop: '1.5px dashed var(--accent)', 
                marginTop: '12px', 
                paddingTop: '12px', 
                gridColumn: 'span 2', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>Current Balance:</span>
                <span style={{ fontWeight: 900, fontSize: '22px', color: 'var(--danger)' }}>{currency}{summary.balance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!isPaymentValid) return;
          await onSave({ ...formData, amount: amountValue });
        }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className='form-group' style={{ marginBottom: 0 }}>
            <label htmlFor='payment-student' style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Select Student</label>
            <select
              id='payment-student'
              style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontWeight: 600 }}
              value={formData.studentId}
              onChange={e => setFormData({ ...formData, studentId: e.target.value })}
              required
            >
              <option value=''>Choose student...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.class})</option>)}
            </select>
          </div>

          <div className='form-group' style={{ marginBottom: 0 }}>
            <label htmlFor='payment-method'>Payment Method</label>
            <select id='payment-method' value={formData.method} onChange={e => setFormData({ ...formData, method: e.target.value })} required>
              <option value='Cash'>Cash</option>
              <option value='Mobile Money'>Mobile Money</option>
              <option value='Bank Transfer'>Bank Transfer</option>
              <option value='Card'>Card</option>
              <option value='Cheque'>Cheque</option>
            </select>
          </div>

          <div className='form-group' style={{ marginBottom: 0 }}>
            <label htmlFor='payment-amount' style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Amount Paying Now ({currency})</label>
            <input
              id='payment-amount'
              style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontWeight: 800, fontSize: '18px' }}
              type='number'
              step='0.01'
              min='0.01'
              max={Math.max(0, summary.balance)}
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              required
              autoFocus
              placeholder='0.00'
            />
          </div>

          {selectedStudent && (
            <div style={{ 
              fontSize: '12px', 
              padding: '12px 16px', 
              background: 'var(--bg-page)', 
              borderRadius: '12px', 
              border: '1.5px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Balance After Payment:</span>
              <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '14px' }}>{currency}{remainingAfter.toLocaleString()}</span>
            </div>
          )}

          <div className='flex gap-3' style={{ marginTop: '12px' }}>
            <button type='button' className='btn btn-secondary' onClick={onClose} style={{ flex: 1, height: '48px', borderRadius: '12px' }}>Cancel</button>
            <button type='submit' className='btn btn-primary' disabled={!isPaymentValid} style={{ flex: 2, height: '48px', borderRadius: '12px', background: 'var(--accent)' }}>
              Submit & Generate Receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function ActivationModal({ user, onClose, onConfirm }) {
  const [pw, setPw] = useState('');
  return (
    <div className='modal' role='presentation'>
      <div className='modal-content card' role='dialog' aria-modal='true' aria-labelledby='activation-modal-title' style={{ maxWidth: '500px' }}>
        <div className='flex-between mb-2'>
          <h2 id='activation-modal-title' style={{ marginBottom: 0 }}>Activate {user?.name}</h2>
          <button type='button' className='btn btn-icon btn-secondary' aria-label='Close activation dialog' onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(user, pw); }}>
        <div className='form-group'>
          <label htmlFor='activation-password'>Set New Password</label>
          <input
            id='activation-password'
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={8}
            required
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          <p style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '8px' }}>
            Enter a temporary password of at least 8 characters. They can change it after logging in.
          </p>
        </div>
        <div className='modal-actions mt-2'>
          <button type='button' className='btn btn-secondary' onClick={onClose}>Cancel</button>
          <button type='submit' className='btn btn-primary' style={{ flex: 1 }}>Confirm & Activate</button>
        </div>
        </form>
      </div>
    </div>
  );
}

function ReportModal({ onClose, departments, setActiveReport, navigate }) {
  return (
    <div className='modal' role='presentation'>
      <div className='modal-content card' role='dialog' aria-modal='true' aria-labelledby='report-modal-title' style={{ maxWidth: '600px', width: '95%', padding: '40px' }}>
        <div className='flex-between mb-6'>
          <h2 id='report-modal-title' style={{ marginBottom: 0, fontSize: '24px', fontWeight: 900 }}>Select Department</h2>
          <button type='button' className='btn btn-icon btn-secondary' aria-label='Close report dialog' onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>

        <div className='grid-2' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
          {Object.keys(departments).map(dept => (
            <div key={dept} className='card hover:shadow-lg transition-all border-t-4' style={{ padding: '24px', borderColor: 'var(--accent)', cursor: 'default', background: 'var(--bg-card)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, color: 'var(--primary)', textAlign: 'left' }}>{dept}</h3>
              <div className='flex flex-col gap-3'>
                <button
                  className='btn btn-secondary w-full'
                  style={{ fontSize: '12px', padding: '12px 16px', fontWeight: 700 }}
                  onClick={() => {
                    setActiveReport({
                      student: { class: departments[dept][0] || 'NURSERY' },
                      template: null,
                      reportData: null,
                      isTemplateMode: true,
                      targetDepartment: dept
                    });
                    onClose();
                    navigate(`/edit-report/template-${dept}`);
                  }}
                >
                  <Settings size={16} style={{ marginRight: '8px' }} /> Customize Structure
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardKpi({ icon: Icon, label, value, detail, tone = 'blue', onClick }) {
  return (
    <button type="button" className={`dashboard-kpi-card tone-${tone}`} onClick={onClick}>
      <span className="dashboard-kpi-icon"><Icon size={22} /></span>
      <span className="dashboard-kpi-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </button>
  );
}

function DashboardPeriodMetric({ label, value, onClick }) {
  return (
    <button type="button" className="dashboard-period-metric" onClick={onClick}>
      <small>{label}</small>
      <strong>{value}</strong>
    </button>
  );
}
