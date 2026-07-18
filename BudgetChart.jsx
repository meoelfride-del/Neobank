import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#16E0B0', '#F2B705', '#FF5D5D', '#3CF0C5', '#8B98AC', '#F7CB3F', '#E24444'];

export default function BudgetChart({ summary }) {
  if (!summary || summary.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-250/40 text-sm">
        Aucune dépense sur les 30 derniers jours.
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={summary}
            dataKey="total"
            nameKey="category"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
            strokeWidth={0}
          >
            {summary.map((entry, i) => (
              <Cell key={entry.category} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#131A26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 13 }}
            labelStyle={{ color: '#fff' }}
            formatter={(value) => [`${value.toFixed(2)} €`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
