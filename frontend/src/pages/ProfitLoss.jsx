import React, { useState, useMemo } from 'react';
import { PieChart, Printer, TrendingUp, TrendingDown } from 'lucide-react';

export default function ProfitLoss({ 
    payments = [], 
    expenditures = [], 
    attendanceData = {}, 
    students = [], 
    feedingConfig = {},
    feedingRecords,
    currency = 'GH₵',
    schoolInfo = {},
    termMetadata,
    termStartDate,
    termEndDate,
    isSubSection = false
}) {
    const [timeframe, setTimeframe] = useState('monthly'); // daily, weekly, monthly, term
    const [customRange, setCustomRange] = useState({ start: '', end: '' });

    const period = useMemo(() => {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        let start;
        if (timeframe === 'custom') {
            const start = customRange.start ? new Date(`${customRange.start}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
            const customEnd = customRange.end ? new Date(`${customRange.end}T23:59:59.999`) : end;
            return { start, end: customEnd, hasExplicitTerm: false, label: 'Custom range' };
        }
        if (timeframe === 'daily') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (timeframe === 'weekly') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            start.setDate(start.getDate() - start.getDay());
        }
        if (timeframe === 'monthly') start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (timeframe === 'term') {
            const matchingTerm = Array.isArray(schoolInfo.terms)
                ? schoolInfo.terms.find(term => term.name === schoolInfo.term || term.term === schoolInfo.term)
                : null;
            const metadata = termMetadata || schoolInfo.termMetadata || matchingTerm || {};
            const startValue = termStartDate || metadata.startDate || metadata.start || schoolInfo.termStartDate;
            const endValue = termEndDate || metadata.endDate || metadata.end || schoolInfo.termEndDate;
            const toBoundary = (value, endOfDay = false) => {
                if (!value) return null;
                const text = String(value);
                if (text.includes('T')) {
                    const parsed = new Date(text);
                    return Number.isNaN(parsed.getTime()) ? null : parsed;
                }
                return new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
            };
            const availableDates = [
                ...(payments || []).map(item => item.date),
                ...(expenditures || []).map(item => item.date),
                ...(Array.isArray(feedingRecords) ? feedingRecords.map(item => item.date) : Object.keys(attendanceData || {})),
            ].filter(Boolean).sort();
            start = toBoundary(startValue) || toBoundary(availableDates[0]) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (endValue) {
                const explicitEnd = toBoundary(endValue, true);
                return { start, end: explicitEnd, hasExplicitTerm: Boolean(startValue), label: metadata.name || schoolInfo.term || 'Term' };
            }
            return { start, end, hasExplicitTerm: Boolean(startValue), label: metadata.name || schoolInfo.term || 'Term' };
        }
        return { start, end, hasExplicitTerm: false, label: timeframe };
    }, [timeframe, customRange, termMetadata, termStartDate, termEndDate, schoolInfo, payments, expenditures, feedingRecords, attendanceData]);

    const financialData = useMemo(() => {
        const parseDate = value => {
            if (!value) return null;
            const text = String(value);
            const date = new Date(text.includes('T') ? text : `${text}T12:00:00`);
            return Number.isNaN(date.getTime()) ? null : date;
        };
        const calculate = targetPeriod => {
        const isInPeriod = dateValue => {
            const date = parseDate(dateValue);
            return Boolean(date) && (!targetPeriod.start || date >= targetPeriod.start) && date <= targetPeriod.end;
        };

        // 1. Fee Revenue
        const feeRevenue = (payments || [])
            .filter(p => isInPeriod(p.date))
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        // Saved feeding records are authoritative when the caller provides them.
        const feedingRevenue = Array.isArray(feedingRecords)
            ? feedingRecords
                .filter(record => isInPeriod(record.date))
                .reduce((sum, record) => sum + (parseFloat(record.totalIncome) || 0), 0)
            : Object.entries(attendanceData || {}).reduce((sum, [date, dayEntry]) => {
                if (!isInPeriod(date)) return sum;
                const dayData = dayEntry.records || dayEntry;
                return sum + (students || []).reduce((daySum, student) =>
                    daySum + (dayData[student.sid] === 'present' ? (Number(feedingConfig[student.class]) || 5) : 0), 0);
            }, 0);

        // 3. Total Expenses
        const totalExpenses = (expenditures || [])
            .filter(e => isInPeriod(e.date))
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        const totalRevenue = feeRevenue + feedingRevenue;
        const profit = totalRevenue - totalExpenses;

        return { feeRevenue, feedingRevenue, totalRevenue, totalExpenses, profit };
        };
        const duration = Math.max(1, period.end.getTime() - period.start.getTime() + 1);
        const previousPeriod = { start: new Date(period.start.getTime() - duration), end: new Date(period.start.getTime() - 1) };
        return { current: calculate(period), previous: calculate(previousPeriod), previousPeriod };
    }, [payments, expenditures, attendanceData, students, feedingConfig, feedingRecords, period]);

    const formatDate = date => date?.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) || 'Unknown date';
    const periodLabel = `${formatDate(period.start)} to ${formatDate(period.end)}`;

    const { feeRevenue, feedingRevenue, totalRevenue, totalExpenses, profit } = financialData.current;
    const previous = financialData.previous;
    const comparison = (current, prior, inverse = false) => {
        const change = prior === 0 ? (current === 0 ? 0 : 100) : ((current - prior) / Math.abs(prior)) * 100;
        const favorable = inverse ? change <= 0 : change >= 0;
        return <span style={{ color: favorable ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs previous</span>;
    };

    const Content = () => (
        <>
            <div className={`view-header ${isSubSection ? 'mt-4' : ''}`} style={isSubSection ? { padding: '10px 0', borderBottom: '1px solid var(--glass-border)' } : {}}>
                <h2 style={{ fontSize: isSubSection ? '1.2rem' : '1.5rem', margin: 0 }}>
                    {isSubSection ? 'Analysis Overview' : `${schoolInfo.schoolName || 'School'} - P&L Engine`}
                    <small style={{ display: 'block', fontSize: '11px', fontWeight: 500, opacity: 0.65, marginTop: '4px' }}>
                        {timeframe === 'term' ? `${period.label}: ` : ''}{periodLabel}{timeframe === 'term' && !period.hasExplicitTerm ? ' (no term start configured)' : ''}
                    </small>
                </h2>
                <div className="flex-gap">
                    <div className="btn-group">
                        {['daily', 'weekly', 'monthly', 'term', 'custom'].map(t => (
                            <button 
                                key={t} 
                                className={`btn btn-sm ${timeframe === t ? 'btn-primary' : 'btn-secondary'} no-print`}
                                onClick={() => setTimeframe(t)}
                                style={{ textTransform: 'capitalize', padding: '4px 10px' }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    {timeframe === 'custom' && <div className="no-print" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}><label style={{ fontSize: '11px' }}>From <input type="date" value={customRange.start} max={customRange.end || undefined} onChange={e => setCustomRange(range => ({ ...range, start: e.target.value }))} /></label><label style={{ fontSize: '11px' }}>To <input type="date" value={customRange.end} min={customRange.start || undefined} onChange={e => setCustomRange(range => ({ ...range, end: e.target.value }))} /></label></div>}
                    {!isSubSection && (
                        <button className="btn btn-secondary no-print" onClick={() => window.print()} title="Print P&L Report">
                            <Printer size={16} /> Print
                        </button>
                    )}
                </div>
            </div>

            <div className="dashboard-kpi-grid mb-4 mt-4">
                <article className="dashboard-kpi-card tone-green">
                    <span className="dashboard-kpi-icon"><TrendingUp size={22} /></span>
                    <span className="dashboard-kpi-copy">
                        <small>Total Revenue</small>
                        <strong>{currency}{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        <em>Fees: {currency}{feeRevenue.toLocaleString()} · Feeding: {currency}{feedingRevenue.toLocaleString()} · {comparison(totalRevenue, previous.totalRevenue)}</em>
                    </span>
                </article>

                <article className="dashboard-kpi-card tone-red">
                    <span className="dashboard-kpi-icon"><TrendingDown size={22} /></span>
                    <span className="dashboard-kpi-copy">
                        <small>Total Expenditure</small>
                        <strong>{currency}{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        <em>Operational and miscellaneous costs · {comparison(totalExpenses, previous.totalExpenses, true)}</em>
                    </span>
                </article>

                <article className={`dashboard-kpi-card ${profit >= 0 ? 'tone-green' : 'tone-red'}`}>
                    <span className="dashboard-kpi-icon"><PieChart size={22} /></span>
                    <span className="dashboard-kpi-copy">
                        <small>Net {profit >= 0 ? 'Profit' : 'Loss'}</small>
                        <strong>{profit < 0 && '-'}{currency}{Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        <em>Net results for {periodLabel} · {comparison(profit, previous.profit)}</em>
                    </span>
                </article>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div className="card" style={{ padding: '24px' }}>
                    <h3>Revenue vs Expenditure Breakdown</h3>
                    <div style={{ marginTop: '20px', height: '30px', background: 'var(--bg-page)', borderRadius: '15px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${(totalRevenue / ((totalRevenue + totalExpenses) || 1)) * 100}%`, background: 'var(--success)', height: '100%' }} />
                        <div style={{ width: `${(totalExpenses / ((totalRevenue + totalExpenses) || 1)) * 100}%`, background: 'var(--danger)', height: '100%' }} />
                    </div>
                    <div className="flex-between mt-2" style={{ fontSize: '13px', fontWeight: 600 }}>
                        <span style={{ color: 'var(--success)' }}>Revenue: {Math.round((totalRevenue / ((totalRevenue + totalExpenses) || 1)) * 100) || 0}%</span>
                        <span style={{ color: 'var(--danger)' }}>Expenses: {Math.round((totalExpenses / ((totalRevenue + totalExpenses) || 1)) * 100) || 0}%</span>
                    </div>
                </div>

                <div className="card" style={{ padding: '24px' }}>
                    <h3>Financial Health</h3>
                    <div className="flex-gap mt-3" style={{ flexDirection: 'column' }}>
                        <HealthItem label="Profit Margin" value={`${totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0}%`} color="var(--primary)" />
                        <HealthItem label="Feeding to Fee Ratio" value={`${feeRevenue > 0 ? Math.round((feedingRevenue / feeRevenue) * 100) : 0}%`} color="var(--accent)" />
                    </div>
                </div>
            </div>
        </>
    );

    if (isSubSection) return <Content />;

    return (
        <section className="view active">
            <Content />
        </section>
    );
}

function HealthItem({ label, value, color }) {
    return (
        <div className="flex-between p-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '13px', opacity: 0.8 }}>{label}</span>
            <span style={{ fontWeight: 800, color }}>{value}</span>
        </div>
    );
}
