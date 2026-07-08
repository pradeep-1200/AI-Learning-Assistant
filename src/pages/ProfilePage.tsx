import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiMessageSquare, FiLogOut, FiAward, FiTarget, FiTrendingUp } from 'react-icons/fi';

interface TopicProgress {
  topic: string;
  total: number;
  completed: number;
}

interface ProfileState {
  totalXP: number;
  level: number;
  quizzesAttempted: number;
  correctAnswersTotal: number;
  totalQuestionsAnswered: number;
  topicProgress: TopicProgress[];
  lastActiveDate: string;
  streak: number;
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const profileKey = `profile_${user?.username || 'user'}`;
  
  const [profile, setProfile] = useState<ProfileState>(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    try {
      const saved = localStorage.getItem(profileKey);
      if (saved) {
        const p: ProfileState = JSON.parse(saved);
        if (p.lastActiveDate === todayStr) {
          // unchanged
        } else if (p.lastActiveDate === yesterdayStr) {
          p.streak = (p.streak || 0) + 1;
        } else {
          p.streak = 1;
        }
        p.lastActiveDate = todayStr;
        return p;
      }
    } catch {}
    
    return {
      totalXP: 0,
      level: 1,
      quizzesAttempted: 0,
      correctAnswersTotal: 0,
      totalQuestionsAnswered: 0,
      topicProgress: [],
      lastActiveDate: todayStr,
      streak: 1
    };
  });

  useEffect(() => {
    localStorage.setItem(profileKey, JSON.stringify(profile));
  }, [profile, profileKey]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const accuracy = profile.totalQuestionsAnswered > 0 
    ? Math.round((profile.correctAnswersTotal / profile.totalQuestionsAnswered) * 100) 
    : 0;

  return (
    <div className="profile-dashboard" style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      color: 'var(--text)',
      overflowY: 'auto',
      paddingBottom: '40px'
    }}>
      {/* ── HEADER ── */}
      <div className="profile-header" style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        padding: '60px 40px 40px',
        borderBottomLeftRadius: '32px',
        borderBottomRightRadius: '32px',
        boxShadow: '0 10px 30px rgba(79, 70, 229, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        marginBottom: '40px'
      }}>
        <div style={{
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          fontWeight: 'bold',
          color: '#fff',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 255, 255, 0.5)',
          marginBottom: '15px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
        }}>
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        
        <h1 style={{ fontSize: '2.2rem', margin: '0 0 10px 0', fontWeight: 'bold' }}>
          {user?.username || 'Learner'}
        </h1>
        
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(5px)'
          }}>
            <FiAward style={{ color: '#fbbf24' }} />
            <span style={{ fontWeight: '600' }}>Lv {profile.level}</span>
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(5px)'
          }}>
            <FiTrendingUp style={{ color: '#4ade80' }} />
            <span style={{ fontWeight: '600' }}>{profile.totalXP} XP</span>
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(5px)'
          }}>
            <span style={{ fontSize: '1.1rem' }}>🔥</span>
            <span style={{ fontWeight: 'bold', color: '#f97316' }}>{profile.streak} Day Streak</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        
        {/* ── STATS GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Total Quizzes</span>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{profile.quizzesAttempted}</span>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Global Accuracy</span>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--green)' }}>{accuracy}%</span>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Correct Answers</span>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>{profile.correctAnswersTotal}</span>
          </div>
        </div>

        {/* ── CONTINUE PRACTICING ── */}
        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiTarget style={{ color: 'var(--primary)' }} />
            Continue Practicing
          </h2>
          
          {(!profile.topicProgress || profile.topicProgress.length === 0) ? (
            <div style={{ background: 'var(--bg-card)', padding: '40px', border: '1px solid var(--border)', borderRadius: '16px', textAlign: 'center', opacity: 0.8 }}>
              <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>You haven't started any topics yet.</p>
              <p style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Head to the Chatbot and take a quiz!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {profile.topicProgress.map((tp, idx) => {
                const percentage = Math.min(100, Math.round((tp.completed / tp.total) * 100));
                return (
                  <div key={idx} style={{
                    background: 'var(--bg-card)',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    cursor: 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '15px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>{tp.topic}</h3>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{percentage}%</span>
                    </div>
                    
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {Math.max(0, tp.total - tp.completed)} problems left to master
                    </div>

                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--highlight-accent))', borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── ACTIONS ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
          <button 
            onClick={() => navigate('/chat')}
            style={{
              padding: '16px 32px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '30px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <FiMessageSquare /> Open Chatbot
          </button>
          
          <button 
            onClick={handleLogout}
            style={{
              padding: '16px 32px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              background: 'transparent',
              color: 'var(--text)',
              border: '2px solid var(--border)',
              borderRadius: '30px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
          >
            <FiLogOut /> Logout
          </button>
        </div>
      </div>
    </div>
  );
}
