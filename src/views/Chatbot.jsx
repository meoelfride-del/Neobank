import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, UserCog } from 'lucide-react';
import api from '../services/api';

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/chatbot/history').then(({ data }) => {
      if (data.messages.length === 0) {
        setMessages([{ id: 'welcome', sender: 'bot', content: "Bonjour ! Je suis l'assistant NeoBank. Comment puis-je vous aider aujourd'hui ?" }]);
      } else {
        setMessages(data.messages);
      }
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, sender: 'user', content }]);
    setSending(true);
    try {
      const { data } = await api.post('/chatbot/message', { content });
      setMessages((prev) => [...prev, { id: `bot-${Date.now()}`, sender: 'bot', content: data.reply, escalated: data.escalated }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-140px)]">
      <h2 className="text-lg font-display font-semibold text-white mb-4">Assistant NeoBank</h2>

      <div className="flex-1 panel p-5 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2.5 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              m.sender === 'user' ? 'bg-mint-500/20 text-mint-400' : m.sender === 'human_agent' ? 'bg-gold-500/20 text-gold-400' : 'bg-white/10 text-slate-250/70'
            }`}>
              {m.sender === 'user' ? <User size={15} /> : m.sender === 'human_agent' ? <UserCog size={15} /> : <Bot size={15} />}
            </div>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
              m.sender === 'user' ? 'bg-mint-500 text-ink-950 font-medium' : 'bg-white/5 text-slate-250/90 border border-white/5'
            }`}>
              {m.content}
              {m.escalated ? <p className="text-[10px] mt-1 opacity-60">Transféré à un conseiller</p> : null}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="flex gap-2 mt-4">
        <input
          className="input-field flex-1"
          placeholder="Posez votre question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={sending || !input.trim()} className="btn-primary px-4">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
