import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';

/**
 * StaffLetterTemplate
 * Renders a printable A4 confirmation letter matching the
 * Apostle Safo School of Arts & Sciences / Kristo Asafo Schools Ltd. design.
 *
 * Props:
 *  schoolInfo   – { schoolName, subName, motto, founded, address, tel, email, website, location, gps, director, banker }
 *  letterData   – { refOur, refYour, recipientName, salutation, date, staffClass, effectDate, bodyParagraphs[], sigName, sigTitle, signatureUrl }
 *  logoUrl      – URL for the school crest/logo
 *  onClose      – called when user clicks × button
 */
export default function StaffLetterTemplate({ schoolInfo = {}, letterData = {}, logoUrl, onClose }) {
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Confirmation Letter - ${letterData.recipientName || ''}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&family=Arial&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; background: #fff; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const {
    schoolName = 'APOSTLE SAFO SCHOOL',
    subName = 'OF ARTS & SCIENCES',
    orgName = 'KRISTO ASAFO SCHOOLS LTD.',
    motto = 'KNOWLEDGE OF GOD IS KEY',
    founded = 'September, 1997',
    address = 'P.O. ML 490 Mallam, Accra',
    tel = '0242773085/0240469992',
    email = 'apostlesafosch@gmail.com',
    website = 'www.greatassas.com',
    location = 'Awoshie Last Stop',
    gps = 'GC-135-2886',
    director = 'APOSTLE DR. KWADWO SAFO',
    banker = 'ACCESS BANK',
  } = schoolInfo;

  const {
    refOur = 'ASSAS/JF/07/6528',
    refYour = '',
    recipientName = 'Lydia Baffour Awuah',
    salutation = 'Lydia',
    date = '10th July, 2026',
    letterTitle = 'CONFIRMATION LETTER',
    staffClass = 'Pre-School',
    department = 'Basic Department',
    effectDate = '2nd July, 2026',
    welfareFee = 'GH₵200.00',
    incomeTax = 'GH₵600.00',
    basicSalary = 'GH₵2,350.00',
    sigName = 'Madam Juliana Frimpong',
    sigTitle = '(Head of School)',
    signatureUrl = '',
    ccTo = 'Accountant',
  } = letterData;

  return (
    <div style={{ position: 'relative' }}>
      {/* Controls */}
      <div className="no-print" style={{
        display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'flex-end',
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-page)', padding: '10px 0'
      }}>
        <button
          onClick={handlePrint}
          style={{
            padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: 'white', fontWeight: 800, fontSize: 13, letterSpacing: '0.5px'
          }}
        >
          <Printer size={16} style={{ marginRight: 7, verticalAlign: 'middle' }} /> Print / Save PDF
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--border-color)',
              cursor: 'pointer', background: 'transparent', color: 'var(--text-main)',
              fontWeight: 700, fontSize: 13
            }}
          >
            <X size={16} style={{ marginRight: 7, verticalAlign: 'middle' }} /> Close
          </button>
        )}
      </div>

      {/* ===== PRINTABLE LETTER ===== */}
      <div ref={printRef}>
        <div style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto',
          background: '#fff',
          color: '#000',
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: '11pt',
          position: 'relative',
          boxShadow: '0 4px 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* === RED LEFT BORDER LINE === */}
          <div style={{
            position: 'absolute',
            left: '18mm',
            top: 0,
            bottom: 0,
            width: '2.5px',
            background: '#cc0000',
            zIndex: 1,
          }} />

          {/* === HEADER === */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            padding: '8mm 10mm 6mm 22mm',
            borderBottom: '2px solid #1a1a6e',
            gap: '8mm',
            position: 'relative',
          }}>
            {/* Logo / Crest */}
            <div style={{
              width: '28mm',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {logoUrl ? (
                <img src={logoUrl} alt="School Crest" style={{ width: '100%', maxHeight: '32mm', objectFit: 'contain' }} />
              ) : (
                /* Placeholder crest */
                <div style={{
                  width: '28mm', height: '28mm',
                  border: '2.5px solid #1a1a6e',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column',
                  background: 'linear-gradient(135deg, #1a1a6e 0%, #8b1a1a 100%)',
                }}>
                  <span style={{ color: '#fff', fontSize: '7pt', fontWeight: 900, textAlign: 'center', padding: '4px', letterSpacing: '0.5px' }}>
                    {schoolName.split(' ').map(w => w[0]).join('')}
                  </span>
                </div>
              )}
            </div>

            {/* School Name Block */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ color: '#1a1a6e', fontWeight: 900, fontSize: '22pt', lineHeight: 1.1, fontFamily: 'Arial, sans-serif', textTransform: 'uppercase' }}>
                {schoolName}
              </div>
              <div style={{ color: '#1a1a6e', fontWeight: 900, fontSize: '22pt', lineHeight: 1.1, fontFamily: 'Arial, sans-serif', textTransform: 'uppercase' }}>
                {subName}
              </div>
              <div style={{ color: '#cc0000', fontWeight: 900, fontSize: '11pt', marginTop: '4mm', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {orgName}
              </div>
              <div style={{ fontSize: '8.5pt', marginTop: '3mm', color: '#333', lineHeight: 1.4 }}>
                <span style={{ fontStyle: 'italic' }}>(Founded: {founded})</span>
              </div>
              <div style={{ fontSize: '9pt', marginTop: '1mm', fontWeight: 900, color: '#1a1a6e' }}>
                MOTTO: <span style={{ color: '#cc0000' }}>{motto}</span>
              </div>
            </div>

            {/* Contact Info Block */}
            <div style={{
              width: '65mm',
              flexShrink: 0,
              fontSize: '8.5pt',
              lineHeight: 1.7,
              color: '#222',
              textAlign: 'right',
            }}>
              <div>{address}</div>
              <div>Tel: <strong>{tel}</strong></div>
              <div>Email: <strong>{email}</strong></div>
              <div>Website: <strong>{website}</strong></div>
              <div>Location: <strong>{location}</strong></div>
              <div>GPS: <strong>{gps}</strong></div>
            </div>
          </div>

          {/* === BODY AREA === */}
          <div style={{ flex: 1, padding: '6mm 12mm 6mm 24mm', position: 'relative' }}>

            {/* Ref Numbers + Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5mm', fontSize: '9.5pt' }}>
              <div>
                <div>Our Ref:........  <strong>{refOur}</strong></div>
                <div style={{ marginTop: '2mm' }}>Your Ref:.........</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>Date: ............  <strong>{date}</strong></div>
              </div>
            </div>

            {/* Recipient */}
            <div style={{ marginBottom: '5mm', fontWeight: 700 }}>
              {recipientName}.
            </div>

            {/* Dear */}
            <div style={{ marginBottom: '5mm' }}>Dear {salutation},</div>

            {/* Letter Title */}
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '13pt', textDecoration: 'underline', marginBottom: '6mm', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
              {letterTitle}
            </div>

            {/* Body Paragraphs */}
            <div style={{ textAlign: 'justify', lineHeight: 1.65, fontSize: '10.5pt' }}>
              <p style={{ marginBottom: '4mm' }}>
                I write on behalf of the Board and Management to confirm you as a permanent
                member of staff of this noble institution with effect from <strong>{effectDate}</strong>.
              </p>
              <p style={{ marginBottom: '4mm' }}>
                You will be required to teach {staffClass} at the {department} and any other
                duty that may fall within your competence which will be assigned to you by
                the Head of School and Management.
              </p>
              <p style={{ marginBottom: '4mm' }}>
                You are by this letter reminded of the terms and condition of service of this
                noble institution. You are also however reminded and encouraged to give off
                your maximum best to uplift the good image and academic success of this great school.
              </p>
              <p style={{ marginBottom: '4mm' }}>
                You shall be an automatic member of the school welfare association for
                which you shall contribute <strong>{welfareFee}</strong> monthly to the welfare fund.
              </p>
              <p style={{ marginBottom: '6mm' }}>
                Your basic taxable salary on which your income tax will be calculated will be{' '}
                <strong>{incomeTax}</strong> and your gross salary shall be <strong>{basicSalary}</strong>.
              </p>
            </div>

            {/* Closing */}
            <div style={{ marginBottom: '2mm' }}>Accept our congratulations on your new appointment.</div>
            <div style={{ marginBottom: '8mm' }}>Yours faithfully,</div>

            {/* Signature Area */}
            <div style={{ marginBottom: '2mm', minHeight: '18mm' }}>
              {signatureUrl && (
                <img src={signatureUrl} alt="Signature" style={{ height: '18mm', objectFit: 'contain' }} />
              )}
              {!signatureUrl && (
                <div style={{ borderBottom: '1px solid #555', width: '55mm', marginBottom: '2mm' }} />
              )}
            </div>
            <div style={{ fontWeight: 900, fontSize: '10.5pt' }}>{sigName}</div>
            <div style={{ fontWeight: 700, fontSize: '10pt' }}>{sigTitle}</div>

            {/* Cc */}
            <div style={{ marginTop: '6mm', fontSize: '9.5pt' }}>
              Cc:
              <div style={{ marginLeft: '6mm' }}>{ccTo}</div>
            </div>
          </div>

          {/* === FOOTER === */}
          <div>
            {/* Rainbow colour band */}
            <div style={{ height: '5mm', background: 'linear-gradient(90deg, #1a1a6e 0%, #3b82f6 25%, #22c55e 45%, #eab308 60%, #ef4444 80%, #9333ea 100%)' }} />

            {/* Director / Banker row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '3mm 12mm',
              background: '#1a1a6e',
              color: '#fff',
              fontSize: '8.5pt',
              fontWeight: 900,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              <div>DIRECTOR: {director}</div>
              <div>Bankers: {banker}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
