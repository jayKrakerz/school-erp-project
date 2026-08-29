import React, { useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { dateKey } from './utils/date';

export default function DashboardChart({ payments, currency, convertAmount = (val) => val }) {
  const data = useMemo(() => {
    const last14Days = [];
    const now = new Date();
    
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      const key = dateKey(date);
      
      const dayTotal = payments
        .filter(p => dateKey(p.date) === key)
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        
      last14Days.push({
        key,
        name: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        revenue: convertAmount(dayTotal)
      });
    }
    return last14Days;
  }, [payments, convertAmount]);

  const total = data.reduce((sum, day) => sum + day.revenue, 0);

  return (
    <div style={{ width: '100%' }}>
      <p id="revenue-chart-summary" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Revenue over the last 14 days: {currency}{total.toLocaleString()}.
      </p>
      <div style={{ height: 250 }} role="img" aria-labelledby="revenue-chart-summary">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7e22ce" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#7e22ce" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--text-muted)' }} 
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--text-muted)' }} 
            tickFormatter={(value) => `${currency}${value}`}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 700 }}
            formatter={(value) => [`${currency}${value.toLocaleString()}`, 'Revenue']}
          />
          <Area 
            type="monotone" 
            dataKey="revenue" 
            stroke="#7e22ce" 
            strokeWidth={4} 
            fillOpacity={1} 
            fill="url(#colorRevenue)" 
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <details style={{ marginTop: '8px' }}>
        <summary>View revenue data table</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', marginTop: '8px' }}>
            <caption>Daily revenue for the last 14 days</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Revenue</th></tr></thead>
            <tbody>
              {data.map(day => <tr key={day.key}><td>{day.name}</td><td>{currency}{day.revenue.toLocaleString()}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
