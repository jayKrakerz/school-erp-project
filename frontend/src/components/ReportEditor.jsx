import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Save, Printer, ArrowLeft, FileText, RotateCcw, RefreshCcw, Plus, Trash, CheckCircle, ImagePlus } from 'lucide-react';
import EditableTable, { initTableData } from './EditableTable';

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

const TEACHER_REMARKS = [
  "Excellent performance. Keep it up.",
  "Very hardworking and disciplined.",
  "Shows great improvement.",
  "Participates actively in class.",
  "Needs to improve concentration.",
  "Punctual and respectful.",
  "A very responsible learner.",
  "Good academic progress.",
  "Has the potential to do better.",
  "Needs more practice at home.",
  "Outstanding performance this term.",
  "Works cooperatively with classmates.",
  "Displays good leadership qualities.",
  "Should participate more in class activities.",
  "Consistent and dedicated learner."
];

const HEAD_REMARKS = [
  "Promoted to the next class.",
  "Excellent academic achievement.",
  "Keep striving for excellence.",
  "Impressive performance this term.",
  "Maintain the good work ethic.",
  "Continue working hard.",
  "Satisfactory progress.",
  "School is proud of your achievement.",
  "Shows promise for greater success.",
  "Needs more commitment next term.",
  "Very commendable effort.",
  "A disciplined and respectful learner."
];

const SearchableDropdown = ({ value, onChange, options, placeholder, listId, accentColor = '#5a189a' }) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'stretch', background: 'white', overflow: 'hidden' }}>
      <input
        type="text"
        list={listId}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          padding: '0 36px 0 8px',
          margin: 0,
          fontSize: '15px',
          fontWeight: 600,
          background: 'transparent',
          outline: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          color: '#000',
          fontFamily: '"Times New Roman", Times, serif',
          boxSizing: 'border-box',
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      />
      <datalist id={listId}>
        {options.map((opt, i) => (
          <option key={i} value={opt} />
        ))}
      </datalist>
      <div className="no-print" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6, display: 'flex', alignItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#000' }}><path d="m6 9 6 6 6-6" /></svg>
      </div>
    </div>
  );
};



const REMARK_PRESETS = [
  "Loves to learn.",
  "Is a great leader.",
  "Comes to school with a smile.",
  "Works cooperatively with classmates.",
  "Is a dedicated worker who is always eager to learn new skills."
];

const CONDUCT_PRESETS = [
  "loves to learn.",
  "Is a great leader.",
  "Comes to school with a smile.",
  "Works cooperatively with classmates.",
  "...... is a joyful learner who actively participates in class and approaches each day with enthusiasm.",
  "...... listens carefully during lessons and always tries his/her best on assigned tasks.",
  "It’s a pleasure to have ...... in class. He/she brings a positive energy to our daily activities."
];

const INTEREST_PRESETS = [
  "Drawing & Art.",
  "Music & Singing.",
  "Football & Athletics.",
  "Reading & Creative Writing.",
  "Public Speaking & Debate."
];

export default function ReportEditor({
  student,
  template,
  existingReport,
  onSave,
  onBack,
  term,
  academicYear,
  settings,
  FEE_CONFIG = {},
  departments = {},
  token,
  backendUrl,
  staff = [],
  isBulkMode = false,
  isTemplateMode = false,
  targetDepartment = null,
  attendanceData = {},
  user = null,
  initialOrientation,
  schoolInfo = {},
  onUpdateSettings = () => { }
}) {
  // Determine department
  const studentClass = (student?.class || '').toUpperCase();
  const dept = isTemplateMode ? targetDepartment : (Object.keys(departments || {}).find(d => (departments[d] || []).includes(studentClass)) || 'LOWER PRIMARY');
  const isPreschool1 = dept === 'PRESCHOOL I' || dept === 'PRESCHOOL' || studentClass.includes('CRECHE') || studentClass.includes('NURSERY 1') || studentClass.includes('NURSERY ONE');
  const isPreschool2 = dept === 'PRESCHOOL II' || studentClass.includes('NURSERY 2') || studentClass.includes('NURSERY TWO') || studentClass.includes('KG') || studentClass.includes('KINDERGARTEN') || studentClass.includes('KINDERGATERN');
  const isJhs = dept === 'JHS' || dept === 'JUNIOR HIGH SCHOOL' || studentClass.includes('JHS') || studentClass.includes('BASIC 7') || studentClass.includes('BASIC 8') || studentClass.includes('BASIC 9');

  const [orientation, setOrientation] = useState(initialOrientation || ((isPreschool1 || isPreschool2 || isJhs) ? 'portrait' : 'landscape'));

  useEffect(() => {
    if (initialOrientation) {
      setOrientation(initialOrientation);
    }
  }, [initialOrientation]);

  const [cacheBuster, setCacheBuster] = useState(Date.now());

  const resolveImageUrl = (url, fallback) => {
    if (!url) return fallback;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http')) return url;
    // For relative paths, prefix with backend URL if it exists
    const base = backendUrl ? backendUrl.replace('/api', '').replace('/data', '') : '';
    return base + url + `?t=${cacheBuster}`;
  };



  const safeParse = (key, fallback) => { try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; } catch (e) { return fallback; } };

  const getSavedSubjects = () => {
    // If there is an existing report, extract the subjects from its scoreTable or scores
    if (existingReport) {
      if (existingReport.scoreTable?.rows) {
        const subjects = [];
        existingReport.scoreTable.rows.forEach(r => {
          if (!r.isFooter && !r.isCategory) {
            const subj = isJhs ? r.cells[0]?.text : r.cells[1]?.text;
            if (subj) subjects.push(subj);
          }
        });
        if (subjects.length > 0) return subjects;
      }
      if (existingReport.scores) {
        const subjects = Object.keys(existingReport.scores);
        if (subjects.length > 0) return subjects;
      }
    }

    const saved = safeParse(`erp_subjects_${dept}`, null);
    // Migration: If we are in Preschool 1 but have standard subjects, or vice versa, reset to defaults
    if (isPreschool1 && saved && (saved.includes('LITERACY') || saved.includes('NUMERACY'))) {
      return PRESCHOOL_I_SUBJECTS;
    }
    if ((isPreschool2 || dept.includes('PRIMARY') || dept.includes('JHS') || isJhs) && saved && saved.includes('COGNITIVE SKILLS')) {
      return isPreschool2 ? PRESCHOOL_II_SUBJECTS : (isJhs ? JHS_SUBJECTS : PRIMARY_SUBJECTS);
    }
    if (isJhs && saved && !saved.includes('CAREER TECHNOLOGY')) {
      return JHS_SUBJECTS;
    }
    if ((dept.includes('PRIMARY') || dept.includes('LOWER PRIMARY') || dept.includes('UPPER PRIMARY')) && saved && saved.includes('CAREER TECHNOLOGY')) {
      return PRIMARY_SUBJECTS;
    }

    if (saved && saved.length > 0) return saved;
    if (isPreschool1) return PRESCHOOL_I_SUBJECTS;
    if (isPreschool2) return PRESCHOOL_II_SUBJECTS;
    if (isJhs) return JHS_SUBJECTS;
    return PRIMARY_SUBJECTS;
  };

  const getHeaders = () => {
    if (isPreschool1) return ["", "SKILLS / CATEGORIES", "1", "2", "3"];
    if (isPreschool2) return ["", "SUBJECTS", "CLASS ACTIVITIES SCORE (50%)", "END OF TERM ASSESSMENT SCORE (50%)", "TOTAL SCORE (100%)"];
    if (isJhs) return ["SUBJECTS", "CLASS ACTIVITIES ASSESSMENT SCORE (50%)", "END OF TERM ASSESSMENT SCORE (50%)", "TOTAL SCORE (100%)", "GRADE"];
    return ["", "SUBJECTS", "CLASS SCORE (50%)", "END OF TERM (50%)", "TOTAL (100%)"];
  };

  const [localSubjects, setLocalSubjects] = useState(getSavedSubjects);
  const [scores, setScores] = useState(() => {
    const init = {};
    localSubjects.forEach(s => {
      init[s] = existingReport?.scores?.[s] || { classScore: '', examScore: '' };
    });
    return init;
  });
  const [reportStatus, setReportStatus] = useState(existingReport?.status || 'draft');
  const [lastAutoSave, setLastAutoSave] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [themeColor, setThemeColor] = useState(() => {
    if (existingReport?.themeColor) return existingReport.themeColor;
    const savedTheme = safeParse(`erp_theme_${dept}`, null);
    return savedTheme?.themeColor || settings?.themeColor || '#b0008e';
  });
  const [accentColor, setAccentColor] = useState(() => {
    if (existingReport?.accentColor) return existingReport.accentColor;
    const savedTheme = safeParse(`erp_theme_${dept}`, null);
    return savedTheme?.accentColor || settings?.accentColor || '#b0008e';
  });
  const [fontColor, setFontColor] = useState(() => {
    if (existingReport?.fontColor) return existingReport.fontColor;
    const savedTheme = safeParse(`erp_theme_${dept}`, null);
    return savedTheme?.fontColor || settings?.fontColor || '#ffffff';
  });

  const [resizing, setResizing] = useState(null);
  const [focusedType, setFocusedType] = useState(null);

  const kidsInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const sigInputRef = useRef(null);

  // Track which image types the user has explicitly deleted — never auto-restore these.
  const userClearedImages = useRef(new Set());

  const [localSettings, setLocalSettings] = useState(() => {
    const savedTemplate = safeParse(`erp_report_settings_${dept}`, {});
    // Merge from global settings (which might contain backend synced department settings)
    const deptBackendSettings = settings?.[`${dept}_settings`] || {};
    const base = { 
      ...deptBackendSettings,
      ...savedTemplate, 
      ...(existingReport?.localSettings || {}) 
    };
    // PRIORITIZE GLOBAL BRANDING: Link to settings and schoolInfo if provided
    if (settings?.logoUrl) base.logoUrl = settings.logoUrl;
    // Select the correct signature based on department type
    const isPreschool = isPreschool1 || isPreschool2;
    const correctSig = isPreschool ? settings?.preschoolHeadSignatureUrl : settings?.headSignatureUrl;
    if (correctSig) base.signatureUrl = correctSig;
    if (schoolInfo?.schoolName) base.schoolName = schoolInfo.schoolName;

    // Restore locally saved images from localStorage if backend hasn't provided them
    // NOTE: kidsGraphic uses a dept-specific key to avoid cross-department overwriting
    ['logo', 'signature'].forEach(type => {
      const saved = localStorage.getItem(`erp_report_${type}`);
      if (saved && !base[`${type}Url`]) {
        base[`${type}Url`] = saved;
      }
    });
    // kidsGraphic: dept-specific key first, then global fallback
    const kgDeptKey = `erp_report_kidsGraphic_${dept}`;
    const kgGlobalKey = `erp_report_kidsGraphic`;
    const deptKg = localStorage.getItem(kgDeptKey);
    const globalKg = localStorage.getItem(kgGlobalKey);
    if (!base.kidsGraphicUrl) {
      base.kidsGraphicUrl = deptKg || globalKg || '';
    }

    // Ensure department name is correct for the template being edited/viewed
    if (isTemplateMode && !base.departmentName) {
      base.departmentName = `${dept} DEPARTMENT`;
    }

    if (!base.kidsGraphicWidth) base.kidsGraphicWidth = 180;
    if (!base.kidsGraphicHeight) base.kidsGraphicHeight = 160;

    return base;
  });

  const [meta, setMeta] = useState(() => {
    // Robust class-based fee lookup
    let tuition = 1000; // Default
    const normalizedClass = (studentClass || "").toUpperCase();
    for (const [key, value] of Object.entries(FEE_CONFIG || {})) {
      if (normalizedClass.includes(key.toUpperCase())) {
        tuition = value;
        break;
      }
    }

    // Auto-link facilitator to current user if teacher, or assigned class teacher
    const normalize = (c) => (c || '').toString().toUpperCase().replace(/\s+/g, '').trim();
    const studentClassNorm = normalize(student?.class);

    let facilitatorName = user?.role === 'TEACHER' ? user.name : '';
    if (staff && student && user?.role !== 'TEACHER') {
      const teacher = staff.find(s => {
        const staffClassNorm = normalize(s.assignedClass);
        return staffClassNorm !== "" && staffClassNorm === studentClassNorm &&
          (s.role || '').toUpperCase().includes('TEACHER');
      });
      if (teacher) facilitatorName = teacher.name;
    }

    // Attendance auto-pop
    let attendanceCount = '';
    let totalDays = '';
    if (attendanceData && student) {
      const attendanceList = [];
      Object.entries(attendanceData || {}).forEach(([date, dayEntry]) => {
        const dayData = dayEntry.records || dayEntry;
        if (dayData && dayData[student.sid]) {
          attendanceList.push({ date, status: dayData[student.sid] });
        }
      });
      if (attendanceList.length > 0) {
        attendanceCount = (attendanceList || []).filter(a => a.status === 'present').length;
        totalDays = attendanceList.length;
      }
    }

    const base = {
      outOf: '',
      attendance: attendanceCount,
      attendanceOutOf: totalDays || existingReport?.meta?.totalDays || '',
      attendanceCount: attendanceCount || existingReport?.meta?.attendanceCount || '',
      totalDays: totalDays || existingReport?.meta?.totalDays || '',
      nextTermBegins: existingReport?.meta?.nextTermBegins || '',
      rollNo: existingReport?.meta?.rollNo || '',
      position: '',
      conduct: '',
      interest: '',
      remarks: '',
      headRemarks: '',
      // Restore persisted signature or fallback to global settings based on department
      headSignature: (() => {
        const isPreschool = isPreschool1 || isPreschool2;
        const signatureUrlKey = isPreschool ? 'preschoolHeadSignatureUrl' : 'headSignatureUrl';
        const signatureToUse = settings?.[signatureUrlKey] || '';
        return localStorage.getItem(`erp_jhs_signature_${student?.sid || 'default'}`) || signatureToUse;
      })(),
      facilitatorName: facilitatorName,
      studentName: student?.name || '',
      studentClass: (student?.class || '').toUpperCase(),
      bill: {
        tuition: tuition.toFixed(2),
        maintenance: '25.00',
        examination: '55.00',
        pta: '10.00',
        sanitation: '20.00',
        it: '10.00',
        arrears: (student?.balance || 0).toFixed(2),
        feeding: '10.00'
      }
    };

    if (existingReport?.meta) {
      const merged = { ...base, ...existingReport.meta };
      if (totalDays > 0) {
        merged.attendance = attendanceCount;
        merged.attendanceOutOf = totalDays;
        merged.attendanceCount = attendanceCount;
        merged.totalDays = totalDays;
      }
      return merged;
    }
    return base;
  });

  const [billTable, setBillTable] = useState(() => {
    if (existingReport?.billTable) return existingReport.billTable;

    // We need the resolved meta values for initialization
    // Use the same logic as the meta initializer to avoid referencing 'meta' state during its own initialization
    const arrearsVal = existingReport?.meta?.bill?.arrears || (student?.balance || 0).toFixed(2);
    const tuitionVal = existingReport?.meta?.bill?.tuition || (FEE_CONFIG[(studentClass || "").toUpperCase()] || 1000).toFixed(2);
    const feedingVal = existingReport?.meta?.bill?.feeding || '10.00';

    if (isJhs) {
      return initTableData(
        ["Sr.", "PARTICULARS", "AMOUNT (GHC)"],
        [
          { cells: ["1.", "TUITION FEES", "700.00"] },
          { cells: ["", "MAINTENANCE", "55.00"] },
          { cells: ["", "EXAMINATION", "75.00"] },
          { cells: ["", "P.T.A", "10.00"] },
          { cells: ["", "SANITATION", "30.00"] },
          { cells: ["", "I.T SERVICES", "30.00"] },
          { cells: ["2.", "SCHOOL FEES FOR NEXT TERM", ""] },
          { cells: ["3.", "ARREARS FROM PREVIOUS TERM", arrearsVal] },
          { cells: ["4.", "FEEDING", feedingVal] },
          { cells: ["", "GRAND TOTAL (GHC)", ""], isFooter: true }
        ]
      );
    }
    if (isPreschool2) {
      return initTableData(
        ["Sr.", "PARTICULARS", "AMOUNT GH₵"],
        [
          { cells: ["1.", "TUITION FEES\nMAINTENANCE\nEXAMINATION\nP.T.A\nSANITATION\nI.T SERVICES", ""] },
          { cells: ["", "SCHOOL FEES FOR NEXT TERM", tuitionVal] },
          { cells: ["2.", "ARREARS FROM PREVIOUS TERM", arrearsVal] },
          { cells: ["3.", "FEEDING", feedingVal] },
          { cells: ["", "TOTAL", ""], isFooter: true }
        ]
      );
    }
    return initTableData(
      ["Sr.", "PARTICULARS", "AMOUNT GH₵"],
      [
        { cells: ["1.", "TUITION FEES", tuitionVal] },
        { cells: ["2.", "MAINTENANCE", existingReport?.meta?.bill?.maintenance || '25.00'] },
        { cells: ["3.", "EXAMINATION", existingReport?.meta?.bill?.examination || '55.00'] },
        { cells: ["4.", "P.T.A", existingReport?.meta?.bill?.pta || '10.00'] },
        { cells: ["5.", "SANITATION", existingReport?.meta?.bill?.sanitation || '20.00'] },
        { cells: ["6.", "I.T SERVICES", existingReport?.meta?.bill?.it || '10.00'] },
        { cells: ["", "SCHOOL FEES FOR NEXT TERM", ""], isCategory: true },
        { cells: ["7.", "ARREARS FROM PREVIOUS TERM", arrearsVal] },
        { cells: ["8.", "FEEDING", feedingVal] },
        { cells: ["9.", "ADMISSION (NEW PUPILS ONLY)", ""] },
        { cells: ["", "TOTAL (SUB-TOTAL)", ""], isFooter: true },
        { cells: ["", "GRAND TOTAL (GHC)", ""], isFooter: true }
      ]
    );
  });

  const [scoreTable, setScoreTable] = useState(() => {
    if (existingReport?.scoreTable) return existingReport.scoreTable;
    const colCount = 5;
    const rows = localSubjects.map(s => {
      const cells = Array(colCount).fill("");
      if (isJhs) {
        cells[0] = s;
        cells[1] = scores[s]?.classScore || "";
        cells[2] = scores[s]?.examScore || "";
      } else {
        cells[0] = "";
        cells[1] = s;
        cells[2] = scores[s]?.classScore || "";
        cells[3] = scores[s]?.examScore || "";
      }
      return {
        cells,
        isCategory: s.endsWith('SKILLS')
      };
    });
    if (!isPreschool1) {
      if (isJhs) {
        const totalCells = Array(colCount).fill("");
        totalCells[0] = "TOTAL SCORE";
        rows.push({ cells: totalCells, isFooter: true });

        const avgCells = Array(colCount).fill("");
        avgCells[0] = "LEARNER'S AVERAGE MARK";
        rows.push({ cells: avgCells, isFooter: true });
      } else {
        const totalCells = Array(colCount).fill("");
        totalCells[1] = "TOTAL SCORE";
        rows.push({ cells: totalCells, isFooter: true });

        const avgCells = Array(colCount).fill("");
        avgCells[1] = isPreschool2 ? "LEARNER'S AVERAGE MARK" : "AVERAGE MARK";
        rows.push({ cells: avgCells, isFooter: true });
      }
    }
    return initTableData(
      getHeaders(),
      rows
    );
  });

  const [billHistory, setBillHistory] = useState([]);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savedDept, setSavedDept] = useState(null); // tracks which dept was just saved

  useEffect(() => {
    if (student && meta) setIsLoading(false);
  }, [student, meta]);


  const removeSubject = (subj) => {
    if (window.confirm(`Remove ${subj}?`)) {
      const newList = (localSubjects || []).filter(s => s !== subj);
      setLocalSubjects(newList);

      const newScores = { ...scores };
      delete newScores[subj];
      setScores(newScores);

      const rows = newList.map(s => {
        const isCategory = s.endsWith('SKILLS');
        if (isJhs) {
          return {
            cells: [s, newScores[s]?.classScore || "", newScores[s]?.examScore || "", "", ""],
            isCategory
          };
        }
        return {
          cells: ["", s, newScores[s]?.classScore || "", newScores[s]?.examScore || "", ""],
          isCategory
        };
      });

      if (!isPreschool1) {
        if (isJhs) {
          rows.push({ cells: ["TOTAL SCORE", "", "", "", ""], isFooter: true });
          rows.push({ cells: ["LEARNER'S AVERAGE MARK", "", "", "", ""], isFooter: true });
        } else {
          rows.push({ cells: ["", "TOTAL SCORE", "", "", ""], isFooter: true });
          rows.push({ cells: ["", isPreschool2 ? "LEARNER'S AVERAGE MARK" : "AVERAGE MARK", "", "", ""], isFooter: true });
        }
      }

      updateScoreTable(initTableData(
        getHeaders(),
        rows
      ));
    }
  };


  const hasLogo = !!(localSettings?.logoUrl && localSettings.logoUrl !== "");
  const hasKidsGraphic = !!(localSettings?.kidsGraphicUrl && localSettings.kidsGraphicUrl !== "");

  const handleSubjectChange = (idx, val) => {
    const updated = [...localSubjects];
    const oldName = updated[idx];
    const newName = val.toUpperCase();
    updated[idx] = newName;
    setLocalSubjects(updated);

    // Migrate score data to new name
    setScores(prev => {
      const next = { ...prev };
      next[newName] = next[oldName] || { classScore: '', examScore: '' };
      if (oldName !== newName) delete next[oldName];
      return next;
    });
  };


  const updateBillTable = (newTable) => {
    setBillHistory(prev => [billTable, ...prev].slice(0, 20));
    setBillTable(newTable);
  };

  const updateScoreTable = (newTable) => {
    setScoreHistory(prev => [scoreTable, ...prev].slice(0, 20));
    setScoreTable(newTable);
  };

  const undoBill = () => {
    if (billHistory.length > 0) {
      setBillTable(billHistory[0]);
      setBillHistory(prev => prev.slice(1));
    }
  };

  const undoScore = () => {
    if (scoreHistory.length > 0) {
      setScoreTable(scoreHistory[0]);
      setScoreHistory(prev => prev.slice(1));
    }
  };

  const handleScoreCellUpdate = (rowIdx, cellIdx, val) => {
    if (!scoreTable?.rows) return;
    const newRows = [...scoreTable.rows];
    const newCells = [...newRows[rowIdx].cells];
    newCells[cellIdx] = { ...newCells[cellIdx], text: val };
    newRows[rowIdx] = { ...newRows[rowIdx], cells: newCells };
    updateScoreTable({ ...scoreTable, rows: newRows });
  };

  const setScore = (subj, field, val) =>
    setScores(p => ({ ...p, [subj]: { ...p[subj], [field]: val } }));

  const setMetaField = (k, v) => setMeta(p => ({ ...p, [k]: v }));
  const setBillField = (k, v) => setMeta(p => ({ ...p, bill: { ...p.bill, [k]: v } }));

  // ── LIFECYCLE & EFFECTS (MOVED AFTER STATE INITIALIZATION TO FIX TDZ CRASH) ──────────

  // Auto-save every 30 seconds
  useEffect(() => {
    if (isBulkMode || isTemplateMode || reportStatus === 'finalized') return;

    const intervalId = setInterval(() => {
      if (handleSave) handleSave(true);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [scores, meta, billTable, scoreTable, themeColor, accentColor, fontColor, localSettings, reportStatus]);

  // Hide document title during printing to prevent browser headers
  useEffect(() => {
    const originalTitle = document.title;
    const handleBeforePrint = () => { document.title = " "; };
    const handleAfterPrint = () => { document.title = originalTitle; };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Force subject sync on dept change
  useEffect(() => {
    const currentSubjects = getSavedSubjects();
    if (JSON.stringify(currentSubjects) !== JSON.stringify(localSubjects)) {
      setLocalSubjects(currentSubjects);
      const newScores = {};
      currentSubjects.forEach(s => {
        newScores[s] = scores[s] || { classScore: '', examScore: '' };
      });
      setScores(newScores);

      if (!isPreschool1 && updateScoreTable) {
        const rows = currentSubjects.map(s => {
          if (isJhs) {
            return {
              cells: [s, newScores[s]?.classScore || "", newScores[s]?.examScore || "", "", ""],
              isCategory: s.endsWith('SKILLS')
            };
          }
          return {
            cells: ["", s, newScores[s]?.classScore || "", newScores[s]?.examScore || "", ""],
            isCategory: s.endsWith('SKILLS')
          };
        });
        if (isJhs) {
          rows.push({ cells: ["TOTAL SCORE", "", "", "", ""], isFooter: true });
          rows.push({ cells: ["LEARNER'S AVERAGE MARK", "", "", "", ""], isFooter: true });
        } else {
          rows.push({ cells: ["", "TOTAL SCORE", "", "", ""], isFooter: true });
          rows.push({ cells: ["", isPreschool2 ? "LEARNER'S AVERAGE MARK" : "AVERAGE MARK", "", "", ""], isFooter: true });
        }
        updateScoreTable(initTableData(getHeaders(), rows));
      }
    }
  }, [dept, isPreschool1, isPreschool2]);

  // Resizing effect
  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const updates = {};
      if (resizing.axis !== 'h') updates[`${resizing.type}Width`] = Math.max(20, resizing.startW + dx);
      if (resizing.axis !== 'w') updates[`${resizing.type}Height`] = Math.max(20, resizing.startH + dy);
      setLocalSettings(prev => ({ ...prev, ...updates }));
    };
    const handleUp = () => {
      setResizing(null);
      document.body.style.cursor = 'default';
    };
    if (resizing.axis === 'w') document.body.style.cursor = 'ew-resize';
    else if (resizing.axis === 'h') document.body.style.cursor = 'ns-resize';
    else document.body.style.cursor = 'nwse-resize';

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = 'default';
    };
  }, [resizing]);

  // Settings sync effect
  useEffect(() => {
    setLocalSettings(prev => {
      const isPreschool = isPreschool1 || isPreschool2;
      const signatureToUse = isPreschool
        ? (settings?.preschoolHeadSignatureUrl || '')
        : (settings?.headSignatureUrl || '');

      const deptBackendSettings = settings?.[`${dept}_settings`] || {};

      const merged = {
        ...deptBackendSettings,
        ...prev, // Keep current local changes (like new uploads) as priority
        signatureUrl: prev.signatureUrl || signatureToUse,
        schoolName: schoolInfo?.schoolName || prev.schoolName
      };
      
      // Ensure specific images are prioritized correctly
      ['logo', 'kidsGraphic', 'signature'].forEach(type => {
        const key = `${type}Url`;
        if (userClearedImages.current.has(type)) {
          merged[key] = '';
        } else {
          const storageKey = type === 'kidsGraphic'
            ? `erp_report_kidsGraphic_${dept}`
            : `erp_report_${type}`;
          const savedInStorage = localStorage.getItem(storageKey);
          
          // CRITICAL: Prioritize the local state (prev) if it has a value.
          // We check for null/undefined specifically, allowing "" to stay if it was intentional.
          if (prev[key] !== undefined && prev[key] !== null && prev[key] !== "") {
            merged[key] = prev[key];
          } else if (deptBackendSettings[key]) {
            // Priority 2: Backend per-department setting
            merged[key] = deptBackendSettings[key];
          } else if (type !== 'kidsGraphic' && settings?.[key]) {
            // Priority 3: Global setting (not for kidsGraphic)
            merged[key] = settings[key];
          } else if (savedInStorage) {
            // Priority 4: LocalStorage fallback
            merged[key] = savedInStorage;
          } else {
            // Fallback: keep whatever we have (prevents wiping)
            merged[key] = prev[key];
          }
        }
      });
      return merged;
    });
  }, [settings, dept]);

  const getJhsGrade = (score) => {
    const t = parseFloat(score);
    if (isNaN(t)) return "";
    if (t >= 80) return "A1";
    if (t >= 70) return "B2";
    if (t >= 65) return "B3";
    if (t >= 60) return "C4";
    if (t >= 55) return "C5";
    if (t >= 50) return "C6";
    if (t >= 45) return "D7";
    if (t >= 40) return "E8";
    return "F9";
  };

  const getPrimaryGrade = (score) => {
    const t = parseFloat(score);
    if (isNaN(t)) return "";
    if (t >= 90) return "A+";
    if (t >= 80) return "A";
    if (t >= 70) return "B";
    if (t >= 60) return "C";
    if (t >= 50) return "D";
    return "F";
  };

  const getBillTotal = () => {
    let sum = 0;
    const totalRowIndex = billTable.rows.findIndex(r => r.cells[1]?.text === "SCHOOL FEES FOR NEXT TERM");
    billTable.rows.forEach((r, i) => {
      if (totalRowIndex !== -1 && i < totalRowIndex) {
        const text = r.cells[2]?.text || "";
        if (text.includes('\n')) {
          text.split('\n').forEach(line => {
            const val = parseFloat(line.trim());
            if (!isNaN(val)) sum += val;
          });
        } else {
          sum += parseFloat(text) || 0;
        }
      }
    });
    return sum.toFixed(2);
  };

  const getPreschoolBillTotal = () => {
    const t = parseFloat(localSettings?.preschoolBillTuition !== undefined ? localSettings.preschoolBillTuition : 560) || 0;
    const m = parseFloat(localSettings?.preschoolBillMaint !== undefined ? localSettings.preschoolBillMaint : 25) || 0;
    const e = parseFloat(localSettings?.preschoolBillExam !== undefined ? localSettings.preschoolBillExam : 55) || 0;
    const p = parseFloat(localSettings?.preschoolBillPta !== undefined ? localSettings.preschoolBillPta : 10) || 0;
    const s = parseFloat(localSettings?.preschoolBillSanitation !== undefined ? localSettings.preschoolBillSanitation : 20) || 0;
    const i = parseFloat(localSettings?.preschoolBillIt !== undefined ? localSettings.preschoolBillIt : 10) || 0;
    return (t + m + e + p + s + i).toFixed(2);
  };

  const getPrimaryBillTotal = () => {
    const t = parseFloat(localSettings?.primaryBillTuition !== undefined ? localSettings.primaryBillTuition : 700) || 0;
    const m = parseFloat(localSettings?.primaryBillMaint !== undefined ? localSettings.primaryBillMaint : 55) || 0;
    const e = parseFloat(localSettings?.primaryBillExam !== undefined ? localSettings.primaryBillExam : 75) || 0;
    const p = parseFloat(localSettings?.primaryBillPta !== undefined ? localSettings.primaryBillPta : 10) || 0;
    const s = parseFloat(localSettings?.primaryBillSanitation !== undefined ? localSettings.primaryBillSanitation : 30) || 0;
    const i = parseFloat(localSettings?.primaryBillIt !== undefined ? localSettings.primaryBillIt : 30) || 0;
    return (t + m + e + p + s + i).toFixed(2);
  };

  const getGrandBillTotal = () => {
    let subtotal = 0;
    if (isJhs) {
      subtotal = parseFloat(getBillTotal());
    } else if (isPreschool1 || isPreschool2) {
      subtotal = parseFloat(getPreschoolBillTotal());
    } else {
      subtotal = parseFloat(getPrimaryBillTotal());
    }
    const arrears = parseFloat(meta?.arrears) || 0;
    const feeding = parseFloat(meta?.feeding) || 0;
    return (subtotal + arrears + feeding).toFixed(2);
  };

  const getScoreTotal = (row) => {
    // For JHS it's cells[1] and cells[2]. For others it's cells[2] and cells[3].
    const a = parseFloat(isJhs ? row.cells[1]?.text : row.cells[2]?.text) || 0;
    const b = parseFloat(isJhs ? row.cells[2]?.text : row.cells[3]?.text) || 0;
    const res = a + b;
    return res > 0 ? res.toFixed(1) : "";
  };

  const validateScore = (value, maximum) => {
    if (value === '' || value === null || value === undefined) return '';
    const score = Number(value);
    if (!Number.isFinite(score)) return 'Enter a number';
    if (score < 0 || score > maximum) return `Must be 0-${maximum}`;
    return '';
  };

  const getScoreCellError = (row, ci, ri, value) => {
    if (row.isFooter || row.isCategory) return '';
    const scoreColumns = isJhs ? [1, 2] : [2, 3];
    return scoreColumns.includes(ci) ? validateScore(value, 50) : '';
  };

  const getScoreValidationError = () => {
    if (isPreschool1) {
      return Object.values(scores).some(score => validateScore(score?.classScore, 3))
        ? 'Each assessment rating must be between 0 and 3.'
        : '';
    }
    if (template && template.type !== 'builtin') {
      return Object.values(scores).some(score =>
        validateScore(score?.classScore, 50) || validateScore(score?.examScore, 50)
      ) ? 'Correct the highlighted scores before saving.' : '';
    }
    const invalid = (scoreTable?.rows || []).some((row, ri) =>
      row.cells.some((cell, ci) => getScoreCellError(row, ci, ri, cell?.text))
    );
    return invalid ? 'Correct the highlighted scores before saving.' : '';
  };

  const computeGrandTotal = () => {
    let sum = 0;
    scoreTable.rows.forEach(r => {
      if (!r.isFooter && !r.isCategory) {
        sum += parseFloat(getScoreTotal(r)) || 0;
      }
    });
    return sum;
  };

  const computeAverage = () => {
    const activeRows = (scoreTable?.rows || []).filter(r => !r.isFooter && !r.isCategory).length;
    return activeRows > 0 ? (computeGrandTotal() / activeRows).toFixed(1) : "0.0";
  };

  const handleImageUpload = useCallback((file, type) => {
    if (!file) return;

    // Step 1: Instantly show base64 preview via FileReader (works offline)
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; // Increased resolution for clarity
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); // High quality JPEG

        setLocalSettings(prev => ({ ...prev, [`${type}Url`]: compressedBase64 }));
        setCacheBuster(Date.now());
        
        // If in template mode, immediately tell the parent App.jsx about this change
        // so it persists across potential parent-induced re-renders.
        if (isTemplateMode && onUpdateSettings) {
          const deptSettingsKey = `${dept}_settings`;
          const currentDeptSettings = settings?.[deptSettingsKey] || {};
          onUpdateSettings({ 
            [deptSettingsKey]: { ...currentDeptSettings, [`${type}Url`]: compressedBase64 } 
          });
        }

        // Persist in localStorage — kidsGraphic uses a per-dept key to avoid cross-dept collisions
        try {
          const storageKey = type === 'kidsGraphic'
            ? `erp_report_kidsGraphic_${dept}`
            : `erp_report_${type}`;
          localStorage.setItem(storageKey, compressedBase64);
          
          // Also save to global key as a backup
          if (type === 'kidsGraphic') localStorage.setItem('erp_report_kidsGraphic', compressedBase64);

          // Also persist into dept settings snapshot so reload picks it up
          const deptSettingsKey = `erp_report_settings_${dept}`;
          const existing = JSON.parse(localStorage.getItem(deptSettingsKey) || '{}');
          existing[`${type}Url`] = compressedBase64;
          localStorage.setItem(deptSettingsKey, JSON.stringify(existing));
          console.log(`Successfully persisted ${type} to localStorage under ${storageKey}`);
        } catch (storageErr) {
          console.warn('localStorage full, could not save image:', storageErr);
        }

        // Step 2: Also push to backend in the background (optional — for cross-device sync)
        if (backendUrl && token) {
          const formData = new FormData();
          // Convert compressed base64 back to blob for upload
          fetch(compressedBase64)
            .then(res => res.blob())
            .then(blob => {
              formData.append('file', blob, file.name || 'image.jpg');
              fetch(`${backendUrl}/upload-${type}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
              })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                  if (data?.success && data?.url) {
                    // Backend URL available — swap in for cross-device use
                    setLocalSettings(prev => ({ ...prev, [`${type}Url`]: data.url }));
                    setCacheBuster(Date.now());
                  }
                })
                .catch(err => console.warn(`Backend upload failed for ${type} (preview still shown):`, err));
            });
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [backendUrl, token]);

  const handlePaste = useCallback((e, type) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) handleImageUpload(file, type);
        break;
      }
    }
  }, [handleImageUpload]);

  const deleteImage = (type) => {
    console.log(`Hard-deleting image: ${type}`);
    userClearedImages.current.add(type);

    const imageStorageKey = type === 'kidsGraphic'
      ? `erp_report_kidsGraphic_${dept}`
      : `erp_report_${type}`;
    localStorage.removeItem(imageStorageKey);

    // Only clear the signature associated with the report currently being edited.
    if (type === 'signature' || type === 'headSignature') {
      localStorage.removeItem(`erp_jhs_signature_${student?.sid || 'default'}`);
      localStorage.removeItem('erp_report_signature');
    }

    const settingsKey = `erp_report_settings_${dept}`;
    const storedSettings = safeParse(settingsKey, {});
    if (storedSettings[`${type}Url`]) {
      delete storedSettings[`${type}Url`];
      localStorage.setItem(settingsKey, JSON.stringify(storedSettings));
    }

    const newSettings = { ...localSettings, [`${type}Url`]: '' };
    setLocalSettings(newSettings);
    if (type === 'signature' || type === 'headSignature') {
      setMeta(prev => ({ ...prev, headSignature: '', signatureUrl: '' }));
    }
    setCacheBuster(Date.now());

    // Sync with backend immediately
    if (backendUrl && token) {
      fetch(`${backendUrl}/data/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      })
        .then(res => res.ok ? console.log(`${type} deleted from backend`) : console.warn(`Failed to delete ${type} from backend`))
        .catch(err => console.warn(`Backend delete failed for ${type}:`, err));
    }
  };

  // ── Utility: re-compress a base64 image to a target max byte size ──────────
  const recompressBase64 = (base64, maxBytes = 500000) => {
    return new Promise((resolve) => {
      if (!base64 || !base64.startsWith('data:image')) { resolve(base64); return; }
      if (base64.length <= maxBytes) { resolve(base64); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const scale = Math.sqrt(maxBytes / base64.length);
        w = Math.max(1, Math.floor(w * scale));
        h = Math.max(1, Math.floor(h * scale));
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve('');
      img.src = base64;
    });
  };

  const saveToDept = async (targetDept) => {
    setIsSaving(true);
    setSaveError('');
    try {
      console.log('Saving template to department:', targetDept);

      const MAX_IMG_BYTES = 500000; // Increased to 500KB for high-quality graphics
      const safeSettings = { ...localSettings };
      const imgKeys = ['logoUrl', 'signatureUrl', 'kidsGraphicUrl', 'headSignatureUrl'];
      
      for (const key of imgKeys) {
        if (safeSettings[key] && safeSettings[key].length > MAX_IMG_BYTES) {
          safeSettings[key] = await recompressBase64(safeSettings[key], MAX_IMG_BYTES);
        }
      }

      if (backendUrl && token) {
        const response = await fetch(`${backendUrl}/data/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            [`${targetDept}_settings`]: safeSettings,
            [`${targetDept}_subjects`]: localSubjects,
            [`${targetDept}_theme`]: { themeColor, accentColor, fontColor }
          })
        });
        if (!response.ok) {
          throw new Error(`Server rejected the template save (${response.status}).`);
        }
        console.log('Master Template successfully synced to backend');
      }

      localStorage.setItem(`erp_subjects_${targetDept}`, JSON.stringify(localSubjects));
      localStorage.setItem(`erp_theme_${targetDept}`, JSON.stringify({ themeColor, accentColor, fontColor }));

      try {
        localStorage.setItem(`erp_report_settings_${targetDept}`, JSON.stringify(safeSettings));
      } catch (storageErr) {
        console.warn('LocalStorage is full. Saving the template snapshot without embedded images.');
        const stripped = { ...safeSettings };
        imgKeys.forEach(k => delete stripped[k]);
        localStorage.setItem(`erp_report_settings_${targetDept}`, JSON.stringify(stripped));
      }

      console.log('Master Template save completed for', targetDept);
      if (onUpdateSettings) {
        onUpdateSettings({
          logoUrl: safeSettings.logoUrl || settings?.logoUrl,
          kidsGraphicUrl: safeSettings.kidsGraphicUrl || settings?.kidsGraphicUrl,
          [`${targetDept}_subjects`]: localSubjects,
          [`${targetDept}_theme`]: { themeColor, accentColor, fontColor },
          [`${targetDept}_settings`]: safeSettings
        });
      }
      setSavedDept(targetDept);
      setTimeout(() => {
        setShowSaveModal(false);
        setSavedDept(null);
        onBack();
      }, 1500);
      return true;
    } catch (err) {
      console.error('Critical Master Save Error:', err);
      setSaveError(err.message || 'Template save failed. Please retry.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (isAutoSave = false) => {
    if (isTemplateMode) {
      return saveToDept(dept);
    }

    // Don't auto-save if already finalized
    if (isAutoSave && reportStatus === 'finalized') return;

    // Aggregate scores from the scoreTable for non-preschool modes
    let finalScores = { ...scores };
    if (!isPreschool1 && (!template || template.type === 'builtin') && scoreTable?.rows) {
      scoreTable.rows.forEach(r => {
        if (!r.isFooter && !r.isCategory) {
          const subj = isJhs ? r.cells[0]?.text : r.cells[1]?.text;
          if (subj) {
            finalScores[subj] = {
              classScore: isJhs ? r.cells[1]?.text : r.cells[2]?.text,
              examScore: isJhs ? r.cells[2]?.text : r.cells[3]?.text
            };
          }
        }
      });
    }

    const validationError = getScoreValidationError();
    if (!isAutoSave && validationError) {
      setSaveError(validationError);
      return false;
    }

    if (!isAutoSave) setIsSaving(true);
    setSaveError('');

    try {
      const payload = {
        id: existingReport?.id,
        studentId: student?.id,
        studentName: student?.name,
        studentClass: student?.class,
        department: dept,
        templateId: template?.id,
        term, academicYear,
        scores: finalScores,
        meta,
        billTable, scoreTable,
        themeColor, accentColor, fontColor,
        localSettings,
        status: reportStatus,
        updatedAt: new Date().toISOString(),
      };

      const didSave = await onSave?.(payload);
      if (didSave !== true) {
        throw new Error('The report was not saved. Please retry.');
      }

      if (isAutoSave) {
        setLastAutoSave(new Date().toLocaleTimeString());
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
      return true;
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(err.message || 'The report was not saved. Please retry.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // If no specific template is found, or it's TSA preschool, use the Hardcoded Design
  const useBuiltinDesign = !template || template.type === 'builtin' || isPreschool1 || isPreschool2;

  if (isLoading || !meta) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-gray-500 animate-pulse">
        <RefreshCcw className="animate-spin mb-4" size={48} />
        <p className="text-lg font-medium">Initializing Report Editor...</p>
      </div>
    );
  }

  if (!useBuiltinDesign) {
    return (
      <div className="report-editor p-8 animate-fade-in">
        <div className="view-header no-print mb-8 glass-header p-4 flex justify-between items-center">
          <button className="btn btn-secondary flex items-center gap-2" onClick={onBack}><ArrowLeft size={18} /> Back</button>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            {isTemplateMode ? (
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>EDITING {dept} TEMPLATE</span>
            ) : (
              <>Custom Report: {student?.name}</>
            )}
          </h1>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            <Save size={16} className="mr-2" /> {isTemplateMode ? 'SAVE MASTER TEMPLATE' : (saved ? 'Saved' : 'Save')}
          </button>
        </div>
        {saveError && (
          <div role="alert" className="no-print" style={{ maxWidth: '1000px', margin: '-20px auto 20px', padding: '10px 14px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontWeight: 600 }}>
            {saveError}
          </div>
        )}

        <div className="card p-8 bg-white shadow-xl" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="flex items-center gap-4 mb-8 p-4 bg-gray-50 rounded-xl border border-dashed">
            <img src="/logo.png" style={{ height: '60px' }} alt="Logo" />
            <div>
              <h2 className="m-0 text-xl font-semibold uppercase">{settings?.schoolName || 'TRUE STAR MONTESSORI SCHOOL'}</h2>
              <div className="badge badge-primary uppercase">{dept} DEPARTMENT</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="score-section">
              <h3 className="flex items-center gap-2 border-b pb-2 mb-4 font-semibold"><FileText size={20} /> ASSESSMENT SCORES</h3>
              {localSubjects.map(s => (
                <div key={s} className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-sm mb-2">{s}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs block mb-1">Class Score (50%)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        className="premium-input text-center"
                        value={scores[s].classScore}
                        aria-invalid={!!validateScore(scores[s].classScore, 50)}
                        style={validateScore(scores[s].classScore, 50) ? { borderColor: '#dc2626', background: '#fef2f2' } : undefined}
                        onChange={e => setScore(s, 'classScore', e.target.value)}
                      />
                      {validateScore(scores[s].classScore, 50) && <span style={{ display: 'block', color: '#b91c1c', fontSize: '11px', marginTop: '3px' }}>{validateScore(scores[s].classScore, 50)}</span>}
                    </div>
                    <div>
                      <label className="text-xs block mb-1">Exam Score (50%)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        className="premium-input text-center"
                        value={scores[s].examScore}
                        aria-invalid={!!validateScore(scores[s].examScore, 50)}
                        style={validateScore(scores[s].examScore, 50) ? { borderColor: '#dc2626', background: '#fef2f2' } : undefined}
                        onChange={e => setScore(s, 'examScore', e.target.value)}
                      />
                      {validateScore(scores[s].examScore, 50) && <span style={{ display: 'block', color: '#b91c1c', fontSize: '11px', marginTop: '3px' }}>{validateScore(scores[s].examScore, 50)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="remarks-section">
              <h3 className="flex items-center gap-2 border-b pb-2 mb-4 font-semibold"><CheckCircle size={20} /> INTEREST / CONDUCT & REMARKS</h3>
              <div className="mb-4">
                <label className="text-[10px] font-medium opacity-60 uppercase mb-1 block">Interest / Conduct</label>
                <div className="flex flex-col gap-2">
                  <select
                    className="premium-input text-xs"
                    onChange={e => {
                      if (!e.target.value) return;
                      const studentFirstName = (student?.name || "The student").trim().split(' ')[0];
                      const val = e.target.value.replace(/\.\.\.\.\.\./g, studentFirstName);
                      setMetaField('conduct', (meta.conduct ? meta.conduct + ' ' : '') + val);
                    }}
                  >
                    <option value="">Select or type conduct remark</option>
                    {CONDUCT_PRESETS.map((p, i) => (
                      <option key={i} value={p}>{p.length > 50 ? p.substring(0, 50) + '...' : p}</option>
                    ))}
                    {INTEREST_PRESETS.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                  </select>
                  <textarea
                    rows={4}
                    className="premium-input"
                    placeholder="Select or type conduct remark"
                    value={meta.conduct || ''}
                    onChange={e => setMetaField('conduct', e.target.value)}
                  ></textarea>
                </div>
              </div>
              <textarea rows={4} className="premium-input mb-4" placeholder="Facilitator Remarks" value={meta.remarks} onChange={e => setMetaField('remarks', e.target.value)}></textarea>

              <div className="flex flex-wrap gap-2 mb-4">
                {REMARK_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const current = meta.remarks || '';
                      const spacer = current && !current.endsWith(' ') ? ' ' : '';
                      setMetaField('remarks', current + spacer + preset);
                    }}
                    className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full border border-gray-300 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
              <input className="premium-input" placeholder="Next Term Begins" value={meta.nextTermBegins} onChange={e => setMetaField('nextTermBegins', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Save-to-Department Panel (inline, no overlay) ── */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, width: '380px', maxWidth: '95vw',
          background: 'white', borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          padding: '24px 22px', fontFamily: 'Outfit, sans-serif',
          border: '2px solid #e8e8e8'
        }} onClick={e => e.stopPropagation()}>
          <style>{`
            .sdep-btn {
              display: block; width: 100%; padding: 13px 16px;
              border-radius: 10px; cursor: pointer; text-align: left;
              font-family: Outfit, sans-serif; margin-bottom: 8px;
              transition: opacity 0.15s;
            }
            .sdep-btn:hover { opacity: 0.82; }
            .sdep-btn:active { opacity: 0.65; }
          `}</style>

          {savedDept ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle size={40} color="#16a34a" role="img" aria-label="Template saved" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '19px', fontWeight: 600, color: '#16a34a' }}>Saved!</div>
              <div style={{ fontSize: '13px', fontWeight: 400, color: '#444', marginTop: '6px' }}>
                Template applied to <strong>{savedDept}</strong>
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
                All classes in this division will use this layout.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a1a1a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Save size={16} aria-hidden="true" /> Save Master Template
              </div>
              <div style={{ fontSize: '12px', color: '#888', fontWeight: 600, marginBottom: '16px' }}>
                Choose which division to apply this template to:
              </div>
              <button
                type="button"
                className="sdep-btn"
                style={{ border: '2px solid #b0008e', background: '#fdf0fb' }}
                onClick={() => saveToDept('PRESCHOOL I')}
                disabled={isSaving}
              >
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#b0008e', display: 'block' }}>PRESCHOOL I</span>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#aaa' }}>Creche &amp; Nursery 1</span>
              </button>
              <button
                type="button"
                className="sdep-btn"
                style={{ border: '2px solid #7c3aed', background: '#f5f0ff' }}
                onClick={() => saveToDept('PRESCHOOL II')}
                disabled={isSaving}
              >
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#7c3aed', display: 'block' }}>PRESCHOOL II</span>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#aaa' }}>Nursery 2 — KG 2</span>
              </button>
              {!isPreschool1 && !isPreschool2 && (
                <button
                  type="button"
                  className="sdep-btn"
                  style={{ border: '2px solid #0369a1', background: '#f0f7ff' }}
                  onClick={() => saveToDept('PRIMARY')}
                  disabled={isSaving}
                >
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#0369a1', display: 'block' }}>PRIMARY DEPARTMENT</span>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: '#aaa' }}>Basic 1 — Basic 6</span>
                </button>
              )}
              <button
                type="button"
                style={{
                  width: '100%', padding: '9px', marginTop: '4px',
                  borderRadius: '8px', border: '1px solid #ddd',
                  background: 'transparent', cursor: 'pointer',
                  fontWeight: 400, fontSize: '12px', color: '#bbb',
                  fontFamily: 'inherit'
                }}
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
              {saveError && <div role="alert" style={{ margin: '10px 0', padding: '9px 10px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', fontWeight: 600 }}>{saveError}</div>}
            </>
          )}
        </div>
      )}
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={e => {
          const file = e.target.files[0];
          if (file) handleImageUpload(file, 'logo');
          e.target.value = '';
        }} />
        <input ref={kidsInputRef} type="file" accept="image/*" onChange={e => {
          const file = e.target.files[0];
          if (file) handleImageUpload(file, 'kidsGraphic');
          e.target.value = '';
        }} />
        <input ref={sigInputRef} type="file" accept="image/*" onChange={e => {
          const file = e.target.files[0];
          if (file) handleImageUpload(file, 'signature');
          e.target.value = '';
        }} />
      </div>
      <div className="report-editor animate-fade-in" data-orientation={orientation} style={{ fontFamily: '"Times New Roman", Times, serif' }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        .report-editor { font-family: "Times New Roman", Times, serif; background: #f0f2f5; min-height: 100vh; padding-bottom: 50px; overflow-x: auto; display: flex; flex-direction: column; align-items: center; }
        .report-container { width: fit-content; margin: 0 auto; background: #f0f2f5; display: flex; flex-direction: column; gap: 20px; padding: 40px; }
        .report-page { 
          width: 210mm; 
          height: 297mm; 
          background: white; 
          padding: 15mm; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
          position: relative; 
          display: flex; 
          flex-direction: column;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        @page { 
          margin: 0mm; 
          size: ${orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm'};
        }
        @media print {
          .no-print, .no-print *, .glass-header, .glass-header *, .view-header, .btn, .orientation-toggle { 
            display: none !important; 
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body { background: white !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          .report-editor { padding: 0 !important; background: white !important; min-height: 0 !important; overflow: visible !important; }
          .report-container { width: 100% !important; margin: 0 !important; padding: 0 !important; gap: 0 !important; display: block !important; }
          .report-page { 
            break-after: page !important;
            width: ${orientation === 'landscape' ? '297mm' : '210mm'} !important;
            height: ${orientation === 'landscape' ? '210mm' : '297mm'} !important;
            overflow: hidden !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 15mm !important;
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            ${!settings?.printColored ? 'filter: grayscale(100%) contrast(1.2) !important;' : ''}
          }
          .only-print { display: block !important; }
        }
        .only-print { display: none; }

        .report-container { 
          display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 40px 20px; width: 100%;
        }
        .report-page { 
          background: white; width: ${orientation === 'landscape' ? '297mm' : '210mm'}; height: ${orientation === 'landscape' ? '210mm' : '297mm'};
          padding: 15mm; box-shadow: 0 30px 60px rgba(0,0,0,0.12); position: relative; color: #1a1a1a; 
          border-radius: 4px; overflow-x: hidden; display: flex; flex-direction: column; flex-shrink: 0; transform-origin: top center;
        }
        .watermark {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
          width: 500px; height: 500px; opacity: 0.05; pointer-events: none; z-index: 0;
          object-fit: contain;
        }
        .section-divider {
          width: 100%; border-top: 1.5px solid ${accentColor}44; margin: 10px 0;
        }
        
        .bill-table { border: 1.5px solid #000; width: 100%; border-collapse: collapse; }
        .bill-table th { border: 1.5px solid #000; background: #fff; padding: 6px; font-size: 11px; font-weight: 900; }
        .bill-table td { border: 1.5px solid #000; padding: 5px 10px; font-size: 12px; font-weight: 700; }
        
        .score-table { border: 2px solid ${accentColor}; width: 100%; border-collapse: collapse; }
        .score-table th { border: 2px solid ${accentColor}; padding: 10px; font-size: 12px; font-weight: 900; color: #000; line-height: 1.2; text-align: center; }
        .score-table td { border: 2px solid ${accentColor}; padding: 8px; text-align: center; font-size: 14px; font-weight: 700; color: #000; }
        
        .score-input { width: 100%; border: none; text-align: center; outline: none; font-size: 14px; background: transparent; font-family: inherit; font-weight: 800; color: #000; }
        
        .signature-box { border: 2px solid ${accentColor}; flex: 1; height: 35px; }
        .signature-label { background: ${accentColor}; color: white; padding: 0 10px; font-weight: 900; font-size: 11px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.1; }
        
        .design-btn { width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; cursor: pointer; transition: transform 0.2s; }
        .design-btn:hover { transform: scale(1.2); }
        
        .glass-header {
          background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.1);
          padding: 15px 40px; display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .orientation-toggle { display: flex; background: #e2e8f0; padding: 4px; border-radius: 8px; gap: 4px; }
        .orientation-btn { padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; }
        .orientation-btn.active { background: white; color: ${accentColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      `}</style>

        {!isBulkMode && (
          <div className="view-header no-print glass-header" style={{ padding: '15px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1000, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
            <div className="flex items-center gap-4">
              <button className="btn btn-secondary flex items-center gap-2" onClick={onBack}><ArrowLeft size={18} /> Back</button>
              <div className="orientation-toggle">
                <button className={`orientation-btn ${orientation === 'landscape' ? 'active' : ''}`} onClick={() => setOrientation('landscape')}>Landscape</button>
                <button className={`orientation-btn ${orientation === 'portrait' ? 'active' : ''}`} onClick={() => setOrientation('portrait')}>Portrait</button>
              </div>
              {user?.role === 'ADMIN' && (
                <>
                  <div className="flex items-center gap-3 ml-6">
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>THEME:</span>
                    <input
                      type="color"
                      value={themeColor}
                      onChange={e => {
                        setThemeColor(e.target.value);
                        setAccentColor(e.target.value);
                        setLocalSettings(prev => ({ ...prev, themeColor: e.target.value, accentColor: e.target.value }));
                      }}
                      style={{ width: '30px', height: '30px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '10px' }}>FONT:</span>
                    <input
                      type="color"
                      value={fontColor}
                      onChange={e => {
                        setFontColor(e.target.value);
                        setLocalSettings(prev => ({ ...prev, fontColor: e.target.value }));
                      }}
                      style={{ width: '30px', height: '30px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <button
                      className="btn btn-secondary btn-sm ml-4"
                      onClick={() => {
                        if (scoreHistory.length > 0) undoScore();
                        else if (billHistory.length > 0) undoBill();
                      }}
                    >
                      <RotateCcw size={14} className="mr-2" /> Undo
                    </button>
                  </div>
                </>
              )}
            </div>

            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              {isTemplateMode ? (
                <span style={{ color: 'var(--accent)' }}>EDITING {dept} TEMPLATE</span>
              ) : (
                <>TSA REPORT: <span style={{ color: themeColor }}>{student?.name}</span></>
              )}
            </h1>
            <div className="flex items-center gap-2">
              {lastAutoSave && (
                <span style={{ fontSize: '11px', opacity: 0.5, marginRight: '10px' }}>
                  Auto-saved: {lastAutoSave}
                </span>
              )}
              <button className="btn btn-primary" style={{ background: themeColor, borderColor: themeColor }} onClick={() => handleSave(false)} disabled={isSaving}>
                <Save size={16} className="mr-2" /> {isTemplateMode ? 'SAVE MASTER TEMPLATE' : (saved ? <>Saved <CheckCircle size={14} aria-hidden="true" /></> : 'Save Draft')}
              </button>
              <button className="btn btn-outline" onClick={() => window.print()}>
                <Printer size={16} />
              </button>
            </div>
          </div>
        )}
        {saveError && !isBulkMode && (
          <div role="alert" className="no-print" style={{ position: 'sticky', top: '72px', zIndex: 999, width: 'min(760px, calc(100% - 24px))', padding: '10px 14px', border: '1px solid #fecaca', borderRadius: '0 0 8px 8px', background: '#fef2f2', color: '#b91c1c', textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>
            {saveError}
          </div>
        )}

        <div className="report-container">
          {isJhs && (
            <div className="report-page" style={{ padding: '10mm 15mm' }}>
              {localSettings?.logoUrl !== "" && (
                <img src={localSettings?.logoUrl || "/logo.png"} className="watermark" alt="Watermark" />
              )}
              <div style={{ display: 'flex', position: 'relative', zIndex: 1, width: '100%', flexDirection: 'column', height: '100%' }}>
                {/* Header Block in Purple Border */}
                <div style={{ border: `2px solid #5a189a`, padding: '10px', display: 'flex', alignItems: 'center', marginBottom: '15px', background: 'white' }}>
                  <img src={localSettings?.logoUrl || "/logo.png"} alt="Logo" style={{ width: '80px', height: '80px', marginRight: '20px' }} onError={(e) => e.target.style.display = 'none'} />
                  <div style={{ flex: 1, textAlign: 'center', fontFamily: '"Times New Roman", Times, serif', color: '#5a189a' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 600, margin: '0 0 5px 0' }}>
                      <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }} value={localSettings?.schoolName || schoolInfo?.schoolName || branding?.schoolName || 'YOUR INSTITUTION NAME'} onChange={e => setLocalSettings({ ...localSettings, schoolName: e.target.value })} />
                    </h1>
                    <p style={{ fontSize: '11px', fontWeight: 400, margin: '0 0 5px 0', color: '#000' }}>
                      <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }} value={localSettings?.schoolContactInfo || 'Email address: truestarmontessorischool2@gmail.com     Tel: 0303958308, 0242734149, 0549783366'} onChange={e => setLocalSettings({ ...localSettings, schoolContactInfo: e.target.value })} />
                    </p>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, textDecoration: 'underline' }}>
                      <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }} value={localSettings?.jhsReportTitle || 'JUNIOR HIGH SCHOOL DEPARTMENT TERMINAL REPORT EDITABLE'} onChange={e => setLocalSettings({ ...localSettings, jhsReportTitle: e.target.value })} />
                    </h2>
                  </div>
                </div>

                {/* Info Block */}
                <div style={{ width: '100%', border: `1.5px solid #5a189a`, background: 'white', fontFamily: '"Times New Roman", Times, serif', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', borderBottom: `1.5px solid #5a189a`, minHeight: '30px' }}>
                    <div style={{ flex: 2, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '120px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>REPORT ON:</div>
                      <div style={{ flex: 1, padding: '4px 6px', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center' }}>{student?.name?.toUpperCase()}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '130px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>CLASS:</div>
                      <div style={{ flex: 1, padding: '4px 6px', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center' }}>{studentClass}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex' }}>
                      <div style={{ width: '110px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>TERM:</div>
                      <div style={{ flex: 1, padding: '4px 6px', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center' }}>{term}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', borderBottom: `1.5px solid #5a189a`, minHeight: '30px' }}>
                    <div style={{ flex: 1.2, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '120px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>NO. ON ROLL:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.rollNo} onChange={e => setMetaField('rollNo', e.target.value)} /></div>
                    </div>
                    <div style={{ flex: 1.5, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '130px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>ACADEMIC YEAR:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.academicYear} onChange={e => setMetaField('academicYear', e.target.value)} /></div>
                    </div>
                    <div style={{ flex: 1.3, display: 'flex' }}>
                      <div style={{ width: '110px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>DATE OF TERM:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.date} onChange={e => setMetaField('date', e.target.value)} /></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', minHeight: '30px' }}>
                    <div style={{ flex: 1.2, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '120px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>NEXT TERM BEG.:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.nextTermBegins} onChange={e => setMetaField('nextTermBegins', e.target.value)} /></div>
                    </div>
                    <div style={{ flex: 1.5, display: 'flex', borderRight: `1.5px solid #5a189a` }}>
                      <div style={{ width: '130px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>TOTAL ATTENDANCE:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.attendanceCount} onChange={e => setMetaField('attendanceCount', e.target.value)} /></div>
                    </div>
                    <div style={{ flex: 1.3, display: 'flex' }}>
                      <div style={{ width: '110px', padding: '4px 6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', color: '#5a189a' }}>OUT OF:</div>
                      <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', fontWeight: 600, fontSize: '13px', textAlign: 'left', paddingLeft: '8px', height: '100%', background: 'transparent' }} value={meta.totalDays} onChange={e => setMetaField('totalDays', e.target.value)} /></div>
                    </div>
                  </div>
                </div>


                {/* Score Table */}
                <div style={{ width: '100%', marginBottom: '20px' }}>
                  <EditableTable
                    tableData={scoreTable}
                    onTableChange={updateScoreTable}
                    borderColor="#5a189a"
                    computedCols={[3, 4]}
                    canUndo={scoreHistory.length > 0}
                    onUndo={undoScore}
                    getCellError={getScoreCellError}
                    computeCell={(row, ci, allRows, ri) => {
                      if (row.isCategory) return "";
                      if (row.cells[0]?.text === "TOTAL SCORE") {
                        if (ci === 3) return computeGrandTotal().toFixed(1);
                        return "";
                      }
                      if (row.cells[0]?.text === "LEARNER'S AVERAGE MARK") {
                        if (ci === 3) return computeAverage();
                        if (ci === 4) return isJhs ? getJhsGrade(computeAverage()) : getPrimaryGrade(computeAverage());
                        return "";
                      }
                      if (ci === 3) return getScoreTotal(row);
                      if (ci === 4) {
                        return isJhs ? getJhsGrade(getScoreTotal(row)) : getPrimaryGrade(getScoreTotal(row));
                      }
                      return "";
                    }}
                    tdStyle={(ci, ri, row) => {
                      if (row.isFooter) return { fontWeight: 600, background: '#f8fafc', fontSize: '11px', textAlign: ci === 0 ? 'left' : 'center', color: '#000', padding: '6px' };
                      if (ci === 0) return { textAlign: 'left', fontWeight: 600, fontSize: '11px', color: '#000', padding: '6px' };
                      if (ci === 3) return { background: '#f8fafc', fontWeight: 600, color: '#000', padding: '6px' };
                      if (ci === 4) return { background: '#f8fafc', fontWeight: 600, color: '#000', padding: '6px' };
                      return { fontSize: '12px', padding: '6px', color: '#000' };
                    }}
                    thStyle={(ci) => ({ fontSize: '10px', padding: '8px 4px', textAlign: 'center', color: '#5a189a', fontWeight: 600 })}
                  />
                </div>

                {/* Remarks Block */}
                <div style={{ width: '100%', border: `1.5px solid #5a189a`, background: 'white', fontFamily: '"Times New Roman", Times, serif', marginTop: 'auto', marginBottom: '50px' }}>
                  <div style={{ display: 'flex', borderBottom: `1.5px solid #5a189a`, minHeight: '35px' }}>
                    <div style={{ width: '300px', padding: '6px', borderRight: `1.5px solid #5a189a`, fontWeight: 400, fontSize: '12px', display: 'flex', alignItems: 'center' }}>POSITION IN CLASS:</div>
                    <div style={{ flex: 1, padding: '0', position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                      <SearchableDropdown
                        value={meta.position || ''}
                        onChange={val => setMetaField('position', val)}
                        options={Array.from({ length: parseInt(meta.rollNo) || 50 }, (_, i) => {
                          const n = i + 1;
                          const s = ["TH", "ST", "ND", "RD"];
                          const v = n % 100;
                          return n + (s[(v - 20) % 10] || s[v] || s[0]);
                        })}
                        placeholder="Select Position"
                        listId="ordinalPositions"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', borderBottom: `1.5px solid #5a189a`, minHeight: '60px' }}>
                    <div style={{ width: '300px', padding: '6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center' }}>CLASS TEACHER'S REMARKS:</div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                      <SearchableDropdown
                        value={meta.remarks || ''}
                        onChange={val => setMetaField('remarks', val)}
                        options={TEACHER_REMARKS}
                        placeholder="Select Class Teacher's Remark"
                        listId="jhsClassRemarks"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', borderBottom: `1.5px solid #5a189a`, minHeight: '60px' }}>
                    <div style={{ width: '300px', padding: '6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center' }}>HEAD TEACHER'S REMARKS:</div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                      <SearchableDropdown
                        value={meta.headRemarks || ''}
                        onChange={val => setMetaField('headRemarks', val)}
                        options={HEAD_REMARKS}
                        placeholder="Select Head Teacher's Remark"
                        listId="jhsHeadRemarks"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', minHeight: '60px' }}>
                    <div style={{ width: '300px', padding: '6px', borderRight: `1.5px solid #5a189a`, fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center' }}>HEAD TEACHER'S SIGNATURE:</div>
                    <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', minHeight: '60px', position: 'relative' }}>
                      {isTemplateMode && (
                        <div className="no-print" style={{ position: 'absolute', top: '-35px', right: '0', display: 'flex', gap: '8px', zIndex: 100, background: '#5a189a', color: 'white', padding: '6px 10px', borderRadius: '6px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, marginRight: '4px', letterSpacing: '0.5px' }}>RESIZE:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 600 }}>W:</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateSettings({ headSigWidth: Math.max(50, (settings?.headSigWidth || 150) - 10) });
                              }}
                              style={{ width: '22px', border: '1px solid white', background: 'transparent', color: 'white', height: '22px', padding: 0, fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}
                            >-</button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateSettings({ headSigWidth: (settings?.headSigWidth || 150) + 10 });
                              }}
                              style={{ width: '22px', border: '1px solid white', background: 'transparent', color: 'white', height: '22px', padding: 0, fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}
                            >+</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '5px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 600 }}>H:</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateSettings({ headSigHeight: Math.max(20, (settings?.headSigHeight || 45) - 5) });
                              }}
                              style={{ width: '22px', border: '1px solid white', background: 'transparent', color: 'white', height: '22px', padding: 0, fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}
                            >-</button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateSettings({ headSigHeight: (settings?.headSigHeight || 45) + 5 });
                              }}
                              style={{ width: '22px', border: '1px solid white', background: 'transparent', color: 'white', height: '22px', padding: 0, fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}
                            >+</button>
                          </div>
                        </div>
                      )}
                      {meta.headSignature ? (
                        <img
                          src={meta.headSignature}
                          alt="Signature"
                          style={{
                            width: `${settings?.headSigWidth || 180}px`,
                            height: `${settings?.headSigHeight || 40}px`,
                            objectFit: 'fill',
                            filter: 'contrast(1.1) brightness(0.95)',
                            display: 'block'
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '10px', opacity: 0.3 }}>OFFICIAL SIGNATURE REQUIRED</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {isJhs && (
            <div className="report-page" style={{ padding: '15mm' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ textAlign: 'left', fontWeight: 600, marginBottom: '10px', fontSize: '18px', fontFamily: '"Times New Roman", Times, serif' }}>
                  {user?.role === 'ADMIN' ? (
                    <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'left', fontSize: 'inherit', fontWeight: 'inherit' }} value={localSettings?.billTitle || "NEXT TERM'S BILL"} onChange={e => setLocalSettings({ ...localSettings, billTitle: e.target.value })} />
                  ) : (
                    <span>{localSettings?.billTitle || "NEXT TERM'S BILL"}</span>
                  )}
                </div>

                <div style={{ width: '100%', margin: '0', marginBottom: '40px', fontFamily: '"Times New Roman", Times, serif' }}>
                  <EditableTable
                    tableData={billTable}
                    onTableChange={updateBillTable}
                    borderColor="#000"
                    canUndo={billHistory.length > 0}
                    onUndo={undoBill}
                    computedCols={[]}
                    renderCell={(val, ri, ci, row) => {
                      if (ci === 2 && row.cells[1]?.text === "SCHOOL FEES FOR NEXT TERM") {
                        return <span style={{ whiteSpace: 'pre-wrap' }}>{getBillTotal()}</span>;
                      }
                      if (ci === 2 && row.cells[1]?.text === "GRAND TOTAL (GHC)") {
                        return <span style={{ whiteSpace: 'pre-wrap' }}>{getGrandBillTotal()}</span>;
                      }
                      return undefined;
                    }}
                    tdStyle={(ci, ri, row) => {
                      if (row.cells[1]?.text === "GRAND TOTAL (GHC)") return { padding: '8px', fontWeight: 900, fontSize: '13px', background: '#f5f5f5', color: '#5a189a', textAlign: ci === 0 ? 'center' : 'left' };
                      if (ci === 0) return { textAlign: 'center', width: '40px', padding: '8px', fontWeight: 600, fontSize: '12px', color: '#000', verticalAlign: 'top' };
                      if (ci === 1) return { textAlign: 'left', padding: '8px', fontWeight: 600, fontSize: '12px', color: '#000', whiteSpace: 'pre-line', verticalAlign: 'top', lineHeight: '1.5' };
                      if (ci === 2) return { textAlign: 'left', width: '150px', padding: '8px', fontWeight: 600, fontSize: '12px', color: '#000', whiteSpace: 'pre-line', verticalAlign: 'top', lineHeight: '1.5' };
                      return { padding: '8px', fontWeight: 600, fontSize: '12px', color: '#000', verticalAlign: 'top' };
                    }}
                    thStyle={(ci) => ({ fontSize: '11px', padding: '10px', textAlign: 'center', fontWeight: 600 })}
                  />
                </div>

                <div style={{ width: '100%', margin: '0', fontSize: '12px', fontWeight: 600, fontFamily: '"Times New Roman", Times, serif', lineHeight: '2', marginBottom: '50px' }}>
                  <p style={{ textDecoration: 'underline', marginBottom: '10px' }}>NB:</p>
                  <p>1. FULL OR HALF (50%) OF THE SCHOOL FEES MUST BE PAID WITHIN THE FIRST WEEK OF RE-OPENING.</p>
                  <p>2. THE BALANCE OF THE SCHOOL FEES SHOULD BE SETTLED AFTER MID-TERMS.</p>
                  <p>3. ALL OUTSTANDING BILLS (ARREARS) SHOULD BE PAID BEFORE SCHOOL RE-OPENS.</p>
                  <p>4. PAYMENT CAN BE MADE IN PERSON OR VIA OUR MOMO ACCOUNT: 0597415834</p>
                </div>

                {/* Footer */}
                <div style={{ position: 'absolute', bottom: '5mm', left: '15mm', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: '#000', opacity: 0.8 }}>
                  <span>{localSettings?.schoolName || 'TRUE STAR MONTESSORI SCHOOL'} © {academicYear} - {term}</span>
                </div>
              </div>
            </div>
          )}


          {/* ─── PAGE 1 (BILL & COVER) ─── */}

          {!isJhs && (
            <div className="report-page">
              {localSettings?.logoUrl !== "" && (
                <img src={localSettings?.logoUrl || "/logo.png"} className="watermark" alt="Watermark" />
              )}
              {/* RESTRUCTURED PAGE 1: TWO-COLUMN SYSTEM FOR PERFECT ALIGNMENT */}
              <div style={{ display: 'flex', gap: '30px', flex: 1, width: '100%', position: 'relative', zIndex: 1 }}>

                {/* LEFT COLUMN: Motto, Grading, Bill, Signatures */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

                  {/* Motto */}
                  <div style={{ fontFamily: '"Comic Sans MS", "Comic Sans", cursive', fontSize: '14px', fontWeight: 600, fontStyle: 'italic', lineHeight: '1.2', textAlign: 'center', color: '#000', padding: '0 5px' }}>
                    <textarea
                      style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', fontFamily: 'inherit', resize: 'none', outline: 'none', overflow: 'hidden' }}
                      value={localSettings?.motto || "“Train up a child in the way he should go: and when he is old, he or she will not depart from it.”"}
                      onChange={e => setLocalSettings({ ...localSettings, motto: e.target.value })}
                      rows={2}
                    ></textarea>
                  </div>

                  {/* Grading Scale - Restored for Preschool I */}
                  {(isPreschool1 || isPreschool2) && (
                    <div style={{ padding: '0 10px' }}>
                      <div style={{ border: `2.5px solid ${accentColor}`, borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ background: accentColor, color: 'white', fontSize: '11px', fontWeight: 900, padding: '4px 8px', textTransform: 'uppercase', textAlign: 'center' }}>GRADING SCALE</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', fontSize: '9px', fontWeight: 800 }}>
                          <div style={{ borderRight: `1px solid ${accentColor}`, padding: '4px 1px' }}>
                            <div style={{ color: accentColor }}>1</div>
                            <div style={{ fontSize: '8px' }}>INTERPRETATION</div>
                          </div>
                          <div style={{ borderRight: `1px solid ${accentColor}`, padding: '4px 1px' }}>
                            <div style={{ color: accentColor }}>2</div>
                            <div style={{ fontSize: '8px' }}>BEGINNING</div>
                          </div>
                          <div style={{ borderRight: `1px solid ${accentColor}`, padding: '4px 1px' }}>
                            <div style={{ color: accentColor }}>3</div>
                            <div style={{ fontSize: '8px' }}>DEVELOPING</div>
                          </div>
                          <div style={{ padding: '4px 1px' }}>
                            <div style={{ color: accentColor }}>4</div>
                            <div style={{ fontSize: '8px' }}>PROFICIENT</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bill Section */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', textDecoration: 'underline', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {user?.role === 'ADMIN' ? (
                        <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', textDecoration: 'underline', outline: 'none' }} value={localSettings?.billTitle || "NEXT TERM'S BILL"} onChange={e => setLocalSettings({ ...localSettings, billTitle: e.target.value })} />
                      ) : (
                        <span>{localSettings?.billTitle || "NEXT TERM'S BILL"}</span>
                      )}
                    </div>
                    <div style={{ border: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontFamily: '"Times New Roman", Times, serif', fontSize: '11px', width: '100%', background: 'white' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, textAlign: 'center', background: '#f5f5f5' }}>
                        <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px' }}>Sr.</div>
                        <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px' }}>PARTICULARS</div>
                        <div style={{ padding: '4px' }}>AMOUNT</div>
                      </div>
                      {(isPreschool1 || isPreschool2) ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1px solid ${accentColor}` }}>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1.</div>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px 8px', fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '2px' }}>
                              <div>TUITION FEES</div>
                              <div>MAINTENANCE</div>
                              <div>EXAMINATION</div>
                              <div>P.T.A</div>
                              <div>SANITATION</div>
                              <div>I.T SERVICES</div>
                            </div>
                            <div style={{ padding: '4px', fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '2px', textAlign: 'right' }}>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillTuition !== undefined ? localSettings.preschoolBillTuition : '560.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillTuition: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillMaint !== undefined ? localSettings.preschoolBillMaint : '25.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillMaint: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillExam !== undefined ? localSettings.preschoolBillExam : '55.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillExam: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillPta !== undefined ? localSettings.preschoolBillPta : '10.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillPta: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillSanitation !== undefined ? localSettings.preschoolBillSanitation : '20.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillSanitation: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.preschoolBillIt !== undefined ? localSettings.preschoolBillIt : '10.00'} onChange={e => setLocalSettings({ ...localSettings, preschoolBillIt: e.target.value })} /></div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 700, fontSize: '10.5px' }}>
                            <div style={{ gridColumn: 'span 2', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px 6px', textAlign: 'right' }}>SCHOOL FEES FOR NEXT TERM</div>
                            <div style={{ padding: '4px 6px', textAlign: 'right' }}>{getPreschoolBillTotal()}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontSize: '10.5px' }}>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px', textAlign: 'center' }}>2.</div>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px 6px', fontWeight: 700 }}>ARREARS FROM PREVIOUS TERM</div>
                            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                              <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={meta?.arrears !== undefined ? meta.arrears : '0.00'} onChange={e => setMetaField('arrears', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontSize: '10.5px' }}>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px', textAlign: 'center' }}>3.</div>
                            <div style={{ borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '4px 6px', fontWeight: 700 }}>FEEDING</div>
                            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                              <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={meta?.feeding !== undefined ? meta.feeding : '0.00'} onChange={e => setMetaField('feeding', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: 'none', fontWeight: 900, fontSize: '11px', background: '#f5f5f5' }}>
                            <div style={{ gridColumn: 'span 2', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, padding: '6px', textAlign: 'right' }}>GRAND TOTAL (GHC)</div>
                            <div style={{ padding: '6px', textAlign: 'right', color: accentColor }}>{getGrandBillTotal()}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1px solid #000` }}>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1.</div>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px 8px', fontSize: '10.5px', display: 'grid', gridTemplateColumns: '1fr', gap: '2px' }}>
                              <div>TUITION FEES</div>
                              <div>MAINTENANCE</div>
                              <div>EXAMINATION</div>
                              <div>P.T.A</div>
                              <div>SANITATION</div>
                              <div>I.T SERVICES</div>
                            </div>
                            <div style={{ padding: '4px', fontSize: '10.5px', display: 'grid', gridTemplateColumns: '1fr', gap: '2px', textAlign: 'right' }}>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillTuition !== undefined ? localSettings.primaryBillTuition : '700.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillTuition: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillMaint !== undefined ? localSettings.primaryBillMaint : '55.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillMaint: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillExam !== undefined ? localSettings.primaryBillExam : '75.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillExam: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillPta !== undefined ? localSettings.primaryBillPta : '10.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillPta: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillSanitation !== undefined ? localSettings.primaryBillSanitation : '30.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillSanitation: e.target.value })} /></div>
                              <div><input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={localSettings?.primaryBillIt !== undefined ? localSettings.primaryBillIt : '30.00'} onChange={e => setLocalSettings({ ...localSettings, primaryBillIt: e.target.value })} /></div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid #000`, fontWeight: 700, fontSize: '10.5px' }}>
                            <div style={{ gridColumn: 'span 2', borderRight: `1.5px solid #000`, padding: '4px 6px', textAlign: 'right' }}>SCHOOL FEES FOR NEXT TERM</div>
                            <div style={{ padding: '4px 6px', textAlign: 'right' }}>{getPrimaryBillTotal()}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid #000`, fontSize: '10.5px' }}>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px', textAlign: 'center' }}>2.</div>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px 6px', fontWeight: 700 }}>ARREARS FROM PREVIOUS TERM</div>
                            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                              <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={meta?.arrears !== undefined ? meta.arrears : '0.00'} onChange={e => setMetaField('arrears', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid #000`, fontSize: '10.5px' }}>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px', textAlign: 'center' }}>3.</div>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px 6px', fontWeight: 700 }}>FEEDING</div>
                            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                              <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={meta?.feeding !== undefined ? meta.feeding : '0.00'} onChange={e => setMetaField('feeding', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: `1.5px solid #000`, fontSize: '10.5px' }}>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px', textAlign: 'center' }}>4.</div>
                            <div style={{ borderRight: `1.5px solid #000`, padding: '4px 6px', fontWeight: 700 }}>ADMISSION (NEW PUPILS ONLY)</div>
                            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                              <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'right', fontSize: 'inherit' }} value={meta?.admission || ''} onChange={e => setMetaField('admission', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '35px 1fr 90px', borderBottom: 'none', fontWeight: 900, fontSize: '11px', background: '#f5f5f5' }}>
                            <div style={{ gridColumn: 'span 2', borderRight: `1.5px solid #000`, padding: '6px', textAlign: 'right' }}>GRAND TOTAL (GHC)</div>
                            <div style={{ padding: '6px', textAlign: 'right' }}>{getGrandBillTotal()}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* NB Section - Restored from Screenshot */}
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#000', marginTop: '5px', lineHeight: '1.4' }}>
                    <div>NB:</div>
                    <div>1. FULL OR HALF (50%) OF THE SCHOOL FEES MUST BE PAID WITHIN THE FIRST WEEK OF RE-OPENING.</div>
                    <div>2. THE BALANCE OF THE SCHOOL FEES SHOULD BE SETTLED AFTER MID-TERMS.</div>
                    <div>3. ALL OUTSTANDING BILLS (ARREARS) SHOULD BE PAID BEFORE SCHOOL RE-OPENS.</div>
                    <div>4. PAYMENT CAN BE MADE IN PERSON OR VIA OUR MOMO ACCOUNT: 0597415824</div>
                  </div>


                  {/* Signatures */}
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ border: `2px solid ${accentColor}`, overflow: 'hidden' }}>
                      <div style={{ background: accentColor, color: 'white', padding: '4px', fontWeight: 600, fontSize: '10px', textAlign: 'center' }}>CLASS FACILITATOR</div>
                      <div style={{ minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ flex: 1, padding: '4px', textAlign: 'center', fontSize: '11px', fontWeight: 700 }}>
                          <input style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent' }} value={meta.facilitatorName?.toUpperCase()} onChange={e => setMetaField('facilitatorName', e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div style={{ border: `2px solid ${accentColor}` }}>
                      <div style={{ background: accentColor, color: 'white', padding: '4px', fontWeight: 600, fontSize: '10px', textAlign: 'center' }}>HEAD OF SCHOOL'S SIGNATURE</div>
                      <div style={{ minHeight: '65px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                        {localSettings.signatureUrl && <img src={localSettings.signatureUrl} style={{ width: `${settings?.preschoolHeadSigWidth || 160}px`, height: `${settings?.preschoolHeadSigHeight || 40}px`, objectFit: 'fill' }} alt="Sig" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Header, Logo, Report Title, Student Info */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

                  {/* School Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    borderTop: `6px solid ${accentColor}`,
                    borderBottom: `6px solid ${accentColor}`,
                    padding: '10px 0',
                    fontFamily: '"Times New Roman", Times, serif'
                  }}>
                    <div
                      style={{ flex: '0 0 75px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: user?.role === 'ADMIN' ? 'pointer' : 'default' }}
                      onClick={() => user?.role === 'ADMIN' && logoInputRef.current?.click()}
                    >
                      {!localSettings?.logoUrl || localSettings.logoUrl === "" ? (
                        <div className="no-print" style={{ fontSize: '8px', fontWeight: 600, color: '#999', textAlign: 'center', border: '1px dashed #ccc', padding: '4px', borderRadius: '4px' }}>LOGO</div>
                      ) : (
                        <img src={resolveImageUrl(localSettings.logoUrl, "/logo.png")} style={{ width: '65px', height: '65px', objectFit: 'contain' }} alt="Logo" />
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', paddingRight: '10px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#000', lineHeight: 1, textTransform: 'uppercase' }}>
                        <textarea style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit', resize: 'none', outline: 'none', overflow: 'hidden', padding: 0, margin: 0 }} value={localSettings?.schoolName || 'TRUE STAR MONTESSORI SCHOOL'} onChange={e => setLocalSettings({ ...localSettings, schoolName: e.target.value })} rows={1}></textarea>
                      </div>
                      <div style={{ fontSize: '11px', color: '#000', lineHeight: 1 }}>
                        Email: <input style={{ border: 'none', background: 'transparent', color: '#0066cc', textDecoration: 'underline', width: '160px', fontSize: 'inherit', padding: 0 }} value={localSettings?.email || 'truestarmontessori@gmail.com'} onChange={e => setLocalSettings({ ...localSettings, email: e.target.value })} />
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#000', marginTop: '1px', lineHeight: 1 }}>
                        TEL: 0303961308, 0242734149, 0245 193 791
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '2px', color: accentColor, textTransform: 'uppercase', lineHeight: 1 }}>
                        <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', padding: 0 }} value={localSettings?.departmentName || 'PRE SCHOOL DEPARTMENT'} onChange={e => setLocalSettings({ ...localSettings, departmentName: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {/* Kids Graphic (Resizable) */}
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '5px 0' }}>
                    <div
                      onClick={() => user?.role === 'ADMIN' && !resizing && kidsInputRef.current?.click()}
                      style={{
                        cursor: (user?.role === 'ADMIN' && !resizing) ? 'pointer' : 'default',
                        position: 'relative',
                        border: (user?.role === 'ADMIN' && focusedType === 'kidsGraphic') ? `1px dashed ${accentColor}` : 'none',
                        padding: '2px'
                      }}
                      onMouseEnter={() => user?.role === 'ADMIN' && setFocusedType('kidsGraphic')}
                      onMouseLeave={() => setFocusedType(null)}
                    >
                      {!localSettings?.kidsGraphicUrl ? (
                        <div style={{ width: '220px', height: '120px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '10px', color: '#999' }}><ImagePlus size={14} aria-hidden="true" /> ADD GRAPHIC</div>
                      ) : (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img
                            src={resolveImageUrl(localSettings.kidsGraphicUrl, "/school-kids.png")}
                            style={{
                              height: `${localSettings.kidsGraphicHeight || 180}px`,
                              width: `${localSettings.kidsGraphicWidth || 220}px`,
                              objectFit: 'contain',
                              imageRendering: 'auto'
                            }}
                            alt="Kids Graphic"
                          />
                          {user?.role === 'ADMIN' && focusedType === 'kidsGraphic' && (
                            <>
                              <div
                                style={{ position: 'absolute', right: 0, bottom: 0, width: '15px', height: '15px', cursor: 'nwse-resize', background: accentColor, borderRadius: '2px', zIndex: 10 }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  setResizing({
                                    type: 'kidsGraphic',
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startW: localSettings.kidsGraphicWidth || 220,
                                    startH: localSettings.kidsGraphicHeight || 180
                                  });
                                }}
                              />
                              <div className="no-print" style={{ position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '5px' }}>
                                <button onClick={(e) => { e.stopPropagation(); setLocalSettings(prev => ({ ...prev, kidsGraphicWidth: (prev.kidsGraphicWidth || 220) + 10 })); }} style={{ padding: '2px 5px', fontSize: '9px', background: accentColor, color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>W+</button>
                                <button onClick={(e) => { e.stopPropagation(); setLocalSettings(prev => ({ ...prev, kidsGraphicWidth: Math.max(50, (prev.kidsGraphicWidth || 220) - 10) })); }} style={{ padding: '2px 5px', fontSize: '9px', background: accentColor, color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>W-</button>
                                <button onClick={(e) => { e.stopPropagation(); setLocalSettings(prev => ({ ...prev, kidsGraphicHeight: (prev.kidsGraphicHeight || 180) + 10 })); }} style={{ padding: '2px 5px', fontSize: '9px', background: accentColor, color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>H+</button>
                                <button onClick={(e) => { e.stopPropagation(); setLocalSettings(prev => ({ ...prev, kidsGraphicHeight: Math.max(20, (prev.kidsGraphicHeight || 180) - 10) })); }} style={{ padding: '2px 5px', fontSize: '9px', background: accentColor, color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>H-</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Student Info Table (Aligned to bottom) */}
                  <div style={{ marginTop: 'auto' }}>
                    {/* Report Title */}
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', fontFamily: '"Times New Roman", Times, serif', marginBottom: '8px' }}>
                      {localSettings?.reportTitle || 'END OF TERM ASSESSMENT REPORT'}
                    </div>
                    <div style={{ width: '100%', border: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, background: 'white', fontFamily: '"Times New Roman", Times, serif', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, minHeight: '35px' }}>
                        <div style={{ width: '130px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>REPORT ON:</div>
                        <div style={{ flex: 1, padding: '6px', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center' }}>{student?.name?.toUpperCase()}</div>
                      </div>
                      <div style={{ display: 'flex', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, minHeight: '35px' }}>
                        <div style={{ width: '130px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>CLASS:</div>
                        <div style={{ flex: 1, padding: '6px', fontSize: '12px', display: 'flex', alignItems: 'center' }}>{studentClass}</div>
                      </div>
                      <div style={{ display: 'flex', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, minHeight: '35px' }}>
                        <div style={{ width: '130px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>ROLL NO:</div>
                        <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', textAlign: 'left', paddingLeft: '6px', fontWeight: 600, height: '100%', background: 'transparent' }} value={meta.rollNo} onChange={e => setMetaField('rollNo', e.target.value)} /></div>
                      </div>
                      <div style={{ display: 'flex', borderBottom: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, minHeight: '35px' }}>
                        <div style={{ width: '130px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>NEXT TERM BEGINS:</div>
                        <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', paddingLeft: '8px', fontSize: '12px', height: '100%', background: 'transparent' }} value={meta.nextTermBegins} onChange={e => setMetaField('nextTermBegins', e.target.value)} /></div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '35px' }}>
                        <div style={{ flex: 1, display: 'flex', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}` }}>
                          <div style={{ width: '130px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>ATTENDANCE:</div>
                          <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', textAlign: 'center', height: '100%', background: 'transparent' }} value={meta.attendanceCount} onChange={e => setMetaField('attendanceCount', e.target.value)} /></div>
                        </div>
                        <div style={{ flex: 1, display: 'flex' }}>
                          <div style={{ width: '85px', padding: '6px', borderRight: `1.5px solid ${isPreschool2 ? accentColor : '#000'}`, fontWeight: 600, fontSize: '10px', display: 'flex', alignItems: 'center' }}>OUT OF:</div>
                          <div style={{ flex: 1, padding: '2px' }}><input style={{ width: '100%', border: 'none', textAlign: 'center', height: '100%', background: 'transparent' }} value={meta.totalDays} onChange={e => setMetaField('totalDays', e.target.value)} /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer and Bubbles removed from Page 1 to avoid overlap with signatures */}
            </div>
          )}



          {/* ─── PAGE 2 (SCORES & REMARKS) ─── */}
          {!isJhs && (
            <div className="report-page" style={{ position: 'relative', overflow: 'hidden' }}>
              {localSettings?.logoUrl !== "" && (
                <img src={localSettings?.logoUrl || "/logo.png"} className="watermark" alt="Watermark" />
              )}
              <div style={{ display: 'flex', gap: '30px', flex: 1, position: 'relative', zIndex: 1, width: '100%', alignItems: 'flex-start' }}>
                {/* Left Side: Scores & Remarks */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0, alignSelf: 'flex-start', overflow: 'hidden' }}>
                  <div style={{ width: '100%', marginBottom: '5px', display: 'flex', justifyContent: 'center' }}>
                    {!isPreschool1 && (
                      <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#000', margin: '10px 0', textDecoration: 'underline', textUnderlineOffset: '3px', textAlign: 'center', textTransform: 'uppercase', width: '100%' }}>
                        {user?.role === 'ADMIN' ? (
                          <input style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'center', fontSize: 'inherit', fontWeight: 'inherit', textDecoration: 'inherit' }} value={localSettings?.compositionTitle || "END OF TERM ASSESSMENT REPORT"} onChange={e => setLocalSettings({ ...localSettings, compositionTitle: e.target.value })} />
                        ) : (
                          <span>{localSettings?.compositionTitle || "END OF TERM ASSESSMENT REPORT"}</span>
                        )}
                      </h2>
                    )}
                  </div>

                  <div style={{ position: 'relative', height: isPreschool1 ? '100%' : 'auto' }}>
                    {isPreschool1 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isPreschool1 ? '1fr 1fr' : '1fr', gap: '30px', columnGap: '60px', height: '100%' }}>
                        {(() => {
                          const categories = [];
                          let current = null;
                          localSubjects.forEach(s => {
                            if (s.endsWith('SKILLS') || s.endsWith('DEVELOPMENT') || s.endsWith('HABITS') || s.endsWith('INTERESTS') || s === 'LITERACY' || s === 'NUMERACY' || s === 'CREATIVITY') {
                              current = { name: s, items: [] };
                              categories.push(current);
                            } else if (current) {
                              current.items.push(s);
                            }
                          });
                          if (categories.length === 0 && localSubjects.length > 0) {
                            categories.push({ name: 'ASSESSMENT', items: localSubjects });
                          }
                          return categories.map((cat, catIdx) => (
                            <div key={catIdx} style={{ border: `2px solid ${accentColor}`, fontFamily: (isPreschool1 || isPreschool2) ? '"Comic Sans MS", "Comic Sans", cursive' : 'inherit', marginBottom: '20px', height: 'fit-content' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: accentColor, color: 'white', fontWeight: 600 }}>
                                    <th style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid white' }}>{cat.name}</th>
                                    <th style={{ width: '30px', padding: '6px', borderRight: '1px solid white' }}>1</th>
                                    <th style={{ width: '30px', padding: '6px', borderRight: '1px solid white' }}>2</th>
                                    <th style={{ width: '30px', padding: '6px' }}>3</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cat.items.map((item, itemIdx) => {
                                    const score = scores[item] || { classScore: '' };
                                    return (
                                      <tr key={itemIdx} style={{ fontWeight: 400, background: '#f6def6' }}>
                                        <td style={{ padding: '6px', textAlign: 'left', borderRight: `1px solid ${accentColor}`, borderTop: `1px solid ${accentColor}`, lineHeight: '1.2' }}>{item}</td>
                                        {[1, 2, 3].map((val, vIdx) => (
                                          <td key={val} onClick={() => setScore(item, 'classScore', val.toString())} style={{ width: '30px', borderRight: vIdx === 2 ? 'none' : `1px solid ${accentColor}`, borderTop: `1px solid ${accentColor}`, textAlign: 'center', cursor: 'pointer', color: accentColor, fontWeight: 600 }}>
                                            {score.classScore === val.toString() ? <CheckCircle size={14} role="img" aria-label="Selected" style={{ margin: '0 auto' }} /> : ''}
                                          </td>
                                        ))}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <EditableTable
                        tableData={scoreTable}
                        onTableChange={updateScoreTable}
                        borderColor={accentColor}
                        computedCols={[4]}
                        canUndo={scoreHistory.length > 0}
                        onUndo={undoScore}
                        getCellError={getScoreCellError}
                        computeCell={(row, ci, allRows, ri) => {
                          if (row.isCategory) return "";
                          if (row.cells[1]?.text === "TOTAL SCORE") return computeGrandTotal().toFixed(1);
                          if (row.cells[1]?.text === "AVERAGE MARK" || row.cells[1]?.text === "LEARNER'S AVERAGE MARK") return computeAverage();
                          return getScoreTotal(row);
                        }}
                        tdStyle={(ci, ri, row) => {
                          const base = { minWidth: '60px' };
                          if (ci === 0) return { width: '30px', padding: '0', textAlign: 'center' };
                          if (ci === 1) { base.textAlign = 'left'; base.paddingLeft = '12px'; base.minWidth = '180px'; }
                          if (row?.isCategory) return { ...base, background: `${accentColor} !important`, color: 'white !important', fontWeight: '900 !important', fontSize: '13px !important' };
                          return base;
                        }}
                        renderCell={(val, ri, ci, row) => {
                          if (ci === 0 && !row.isFooter && !isBulkMode) {
                            const subj = row.cells[1]?.text;
                            return (
                              <button className="btn btn-icon btn-secondary btn-sm no-print" style={{ color: 'var(--danger)', height: '24px', width: '24px', margin: '0 auto', border: 'none', background: 'transparent', position: 'relative', zIndex: 10, cursor: 'pointer' }} title={`Remove ${subj}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeSubject(subj); }}>
                                <Trash size={12} />
                              </button>
                            );
                          }
                          return undefined;
                        }}
                      />
                    )}
                  </div>

                  {!isPreschool1 && (
                    <div style={{ marginTop: '30px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', border: `2px solid ${accentColor}` }}>
                        <div style={{ padding: '8px', borderRight: `2px solid ${accentColor}`, fontWeight: 600, fontSize: '11px', lineHeight: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>INTEREST / CONDUCT</div>
                        <div style={{ position: 'relative', width: '100%', minHeight: '60px', display: 'flex', alignItems: 'stretch' }}>
                          <SearchableDropdown value={meta.conduct || ''} onChange={val => setMetaField('conduct', val)} options={[...CONDUCT_PRESETS, ...INTEREST_PRESETS]} accentColor={accentColor} placeholder="Select Interest / Conduct" listId="preschoolConductList" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', border: `2px solid ${accentColor}`, borderTop: 'none' }}>
                        <div style={{ padding: '10px', borderRight: `2px solid ${accentColor}`, fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>CLASS FACILITATOR'S REMARKS</div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                          <SearchableDropdown value={meta.remarks || ''} onChange={val => setMetaField('remarks', val)} options={TEACHER_REMARKS} accentColor={accentColor} placeholder="Select Facilitator's Remark" listId="preschoolFacilitatorRemarks" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side: Composition Explanation */}
                {!isPreschool1 && (
                  <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', fontFamily: '"Comic Sans MS", "Comic Sans", cursive', alignSelf: 'flex-start', minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ visibility: 'hidden', pointerEvents: 'none', userSelect: 'none' }}>
                      <div style={{ width: '100%', marginBottom: '5px', display: 'flex' }}>
                        <h2 style={{ fontSize: '18px', margin: '10px 0', width: '100%' }}>{localSettings?.compositionTitle || "END OF TERM ASSESSMENT REPORT"}</h2>
                      </div>
                    </div>
                    <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                      {user?.role === 'ADMIN' ? (
                        <textarea style={{ width: '100%', minHeight: '200px', border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 500, color: '#000', lineHeight: '1.8', padding: '0', fontFamily: 'inherit', outline: 'none', resize: 'none' }} value={localSettings?.compositionText ?? "• CLASS SCORE FOR THE TERM (INCLUDES CLASS EXERCISES, TAKE HOME ASSIGNMENTS, MIDTERM ASSESSMENTS & CLASS PARTICIPATION) REPRESENTING - 50%\n\n• END OF TERM ASSESSMENT SCORE - 50%\n\n• TOTAL ASSESSMENT SCORE 100%."} onChange={e => setLocalSettings({ ...localSettings, compositionText: e.target.value })} placeholder="Type report composition details here..." />
                      ) : (
                        <div style={{ textAlign: 'left', fontSize: '13px', fontWeight: 500, color: '#000', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{localSettings?.compositionText || "• CLASS SCORE FOR THE TERM (INCLUDES CLASS EXERCISES, TAKE HOME ASSIGNMENTS, MIDTERM ASSESSMENTS & CLASS PARTICIPATION) REPRESENTING - 50%\n\n• END OF TERM ASSESSMENT SCORE - 50%\n\n• TOTAL ASSESSMENT SCORE 100%."}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pink Bubble Graphics */}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '60%', height: '80px', overflow: 'hidden', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', pointerEvents: 'none', zIndex: 0 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ minWidth: '160px', height: '160px', borderRadius: '50%', background: accentColor, marginRight: '-60px', marginBottom: '-80px', opacity: 0.9 }}></div>
                ))}
              </div>

              {isPreschool1 ? (
                <div style={{ position: 'absolute', bottom: '5mm', left: 0, width: '100%', display: 'flex', padding: '0 15mm' }}>
                  <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', fontWeight: 600, opacity: 0.8 }}>{localSettings?.schoolName || 'TRUE STAR MONTESSORI SCHOOL'} © {academicYear} - {term}</div>
                  <div style={{ width: '60px' }}></div>
                  <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', fontWeight: 600, opacity: 0.8 }}></div>
                </div>
              ) : (
                <div style={{ position: 'absolute', bottom: '5mm', left: '15mm', textAlign: 'left', fontSize: '10px', fontWeight: 600, opacity: 0.8 }}>{localSettings?.schoolName || 'TRUE STAR MONTESSORI SCHOOL'} © {academicYear} - {term}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
