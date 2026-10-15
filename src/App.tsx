import { useState, useEffect, useCallback } from 'react';
import { SpeedGauge } from './components/SpeedGauge';
import { ResultCard } from './components/ResultCard';
import { History } from './components/History';
import { FAQ } from './components/FAQ';
import { FeatureGrid } from './components/FeatureGrid';
import { ServerInfo } from './components/ServerInfo';
import { ServerModal } from './components/ServerModal';
import { LanguageModal } from './components/LanguageModal';
import { NavModal } from './components/NavModal';
import { ComingSoonModal } from './components/ComingSoonModal';
import { NetworkHealth } from './components/NetworkHealth';
import { ComparativeStats } from './components/ComparativeStats';
import { GlobalReportCard } from './components/GlobalReportCard';
import { JitterGraph } from './components/JitterGraph';
import { ShareResults } from './components/ShareResults';
import { WeeklyReportSignup } from './components/WeeklyReportSignup';
import { VoiceAssistant } from './components/VoiceAssistant';
import { UserProfile } from './components/UserProfile';
import { LanguageProvider } from './i18n/LanguageContext';
import { useLanguage } from './i18n/useLanguage';
import { useRealSpeedTest } from './hooks/useRealSpeedTest';
import { getISPInfo, generateServerName } from './utils/getISPInfo';
import type { TestResult } from './hooks/useAccurateSpeedTest';
import type { Server } from './components/ServerInfo';
import type { Language } from './i18n/translations';

function getStatusMessage(value: number, type: 'download' | 'upload' | 'ping'): string {
  if (type === 'download') {
    if (value === 0) return 'Waiting...';
    if (value < 10) return 'Basic browsing only';
    if (value < 25) return 'Good for SD streaming';
    if (value < 50) return 'Great for HD streaming';
    if (value < 100) return 'Excellent for 4K & gaming';
    return 'Ultra-fast — fiber speed';
  }
  if (type === 'upload') {
    if (value === 0) return 'Waiting...';
    if (value < 5) return 'Sufficient for emails';
    if (value < 10) return 'Good for video calls';
    if (value < 25) return 'Great for file sharing';
    return 'Excellent upload speed';
  }
  // ping
  if (value === 0) return 'Waiting...';
  if (value < 20) return 'Excellent for gaming';
  if (value < 50) return 'Good for most uses';
  if (value < 100) return 'Acceptable';
  return 'High latency detected';
}

export default function App() {
  const { state, startTest, reset } = useRealSpeedTest();
  const { currentLanguageInfo, changeLanguage, isLanguageModalOpen, setIsLanguageModalOpen, t } = useLanguage();
  const [history, setHistory] = useState<TestResult[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  
  // Navigation modal state
  const [navSection, setNavSection] = useState<'learn' | 'data' | 'about' | null>(null);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Toggle Theme
  const toggleTheme = useCallback(() => {
    import('./utils/audio').then(({ playSound }) => playSound.theme());
    setIsDarkMode(prev => !prev);
    if (isDarkMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isDarkMode]);
  
  // Coming soon modal state
  const [comingSoonTitle, setComingSoonTitle] = useState<string | null>(null);
  
  // ISP Info state
  const [ispInfo, setIspInfo] = useState({
    isp: '',
    ip: '',
    server: {
      id: '',
      name: '',
      location: '',
      country: '',
    },
  });
  const [isIspLoading, setIsIspLoading] = useState(true);
  
  // Server modal state
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  // Fetch actual ISP information on mount
  useEffect(() => {
    async function fetchIspInfo() {
      try {
        const info = await getISPInfo();
        if (info) {
          setIspInfo({
            isp: info.isp,
            ip: info.ip,
            server: {
              id: Date.now().toString(),
              name: generateServerName(info.isp),
              location: info.city || info.region || 'Unknown',
              country: info.country || 'India',
            },
          });
        }
      } catch (error) {
        console.warn('Could not fetch ISP info, using defaults');
      } finally {
        setIsIspLoading(false);
      }
    }
    fetchIspInfo();
  }, []);

  // Load history on mount
  useEffect(() => {
    const raw = localStorage.getItem('speedtest-history');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setHistory(parsed);
        // Show history if we have results
        if (parsed.length > 0) {
          setShowHistory(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Update history when test completes
  useEffect(() => {
    if (state.phase === 'done') {
      // Wait for localStorage to be updated by the hook
      setTimeout(() => {
        const raw = localStorage.getItem('speedtest-history');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setHistory(parsed);
            // Auto-show history after test completes
            setShowHistory(true);
            // Scroll to history section smoothly
            setTimeout(() => {
              const historyElement = document.getElementById('history-section');
              if (historyElement) {
                historyElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 800);
          } catch (error) {
            console.error('Failed to load history:', error);
          }
        }
      }, 500);
    }
  }, [state.phase]);

  const handleStart = useCallback(() => {
    import('./utils/audio').then(({ playSound }) => playSound.pop());
    startTest();
  }, [startTest]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem('speedtest-history');
    setHistory([]);
  }, []);

  const displaySpeed = state.phase === 'idle' ? 0 : state.currentSpeed;
  const isDone = state.phase === 'done';
  const hasError = state.phase === 'error';
  const statusMessage =
    state.phase === 'ping'
      ? 'Measuring latency (ping)…'
      : state.phase === 'download'
        ? 'Measuring download speed…'
        : state.phase === 'upload'
          ? 'Measuring upload speed…'
          : state.phase === 'done'
            ? 'Speed test complete.'
            : hasError
              ? state.error || 'Speed test failed.'
              : state.isOnline
                ? 'Ready to start a speed test.'
                : 'You are offline. Reconnect to run the speed test.';

  return (
    <LanguageProvider currentLang={currentLanguageInfo.code} currentLanguageInfo={currentLanguageInfo}>
    <div className="min-h-screen bg-[#0a0e1a] text-white relative overflow-x-hidden">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#00d4ff]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#00ff88]/5 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-[#b84dff]/5 blur-[120px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <nav className="relative z-20 border-b border-white/5 bg-[#0a0e1a]/95 backdrop-blur-sm" aria-label="Top navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left side - Language & Main Links */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Language Dropdown */}
              <button 
                onClick={() => setIsLanguageModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5" 
                aria-label={t('nav.language')} 
                aria-haspopup="true"
              >
                <span className="text-lg">{currentLanguageInfo.flag}</span>
                <span className="hidden sm:inline">{currentLanguageInfo.nativeName}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Navigation Links */}
              <a href="#" className="px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">{t('nav.apps')}</a>
              <button onClick={() => setNavSection('learn')} className="px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">{t('nav.learn')}</button>
              <button onClick={() => setNavSection('data')} className="px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">{t('nav.data')}</button>
              <button onClick={() => setNavSection('about')} className="px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">{t('nav.about')}</button>
            </div>

            {/* Right side - Icons */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Help Icon */}
              <button className="p-2 text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5" aria-label={t('nav.help')}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Header with Logo */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-sm bg-[#0a0e1a]/80 sticky top-14">
        {/* Crazy Particle Top Animation (Copied from Option A logic) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
          <div className="absolute top-0 left-1/4 w-1 h-20 bg-gradient-to-b from-transparent via-[#00d4ff] to-transparent animate-speed-line"></div>
          <div className="absolute top-0 left-2/4 w-1 h-32 bg-gradient-to-b from-transparent via-[#00ff88] to-transparent animate-speed-line" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-0 left-3/4 w-1 h-16 bg-gradient-to-b from-transparent via-[#b84dff] to-transparent animate-speed-line" style={{ animationDelay: '2s' }}></div>
          <div className="absolute -top-10 left-[10%] w-20 h-20 bg-[#00d4ff]/10 blur-2xl animate-pulse"></div>
          <div className="absolute -top-10 right-[10%] w-20 h-20 bg-[#00ff88]/10 blur-2xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center text-xl font-bold shadow-[0_0_20px_rgba(0,212,255,0.3)] group-hover:rotate-[360deg] transition-transform duration-700">
              ⚡
            </div>
            <div>
              <div className="font-bold text-white text-lg tracking-tight group-hover:text-shimmer transition-all">SpeedCheck</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">{t('hero.title1')} {t('hero.title2')}</div>
            </div>
          </div>
          <nav className="flex items-center gap-4" aria-label="Secondary navigation">
            {/* Professional Theme Switcher - Toggle Style */}
            <button
              onClick={toggleTheme}
              className="group relative flex items-center w-14 h-7 bg-white/5 border border-white/10 rounded-full p-1 transition-all duration-500 hover:border-white/20 overflow-hidden"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 transition-opacity duration-500 ${isDarkMode ? 'opacity-100' : 'opacity-0'}`}></div>
              <div className={`absolute inset-0 bg-gradient-to-r from-orange-400/20 to-yellow-400/20 transition-opacity duration-500 ${!isDarkMode ? 'opacity-100' : 'opacity-0'}`}></div>
              
              <div className={`relative flex items-center justify-center w-5 h-5 rounded-full transition-all duration-500 shadow-lg transform ${isDarkMode ? 'translate-x-7 bg-[#0a0e1a]' : 'translate-x-0 bg-white'}`}>
                {isDarkMode ? (
                  <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12 8.485a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => {
                setShowHistory(prev => !prev);
                // Scroll to history section
                setTimeout(() => {
                  const historyElement = document.getElementById('history-section');
                  if (historyElement) {
                    historyElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }}
              className="text-sm text-slate-400 hover:text-[#00d4ff] transition-colors flex items-center gap-1.5 relative"
              aria-label={t('nav.history')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">{t('nav.history')}</span>
              {history.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-bold text-white bg-[#00d4ff] rounded-full animate-pulse">
                  {history.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6" aria-labelledby="main-heading">
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
              {t('hero.badge')}
            </div>
            <h1 id="main-heading" className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-tight">
              <span className="text-white">{t('hero.title1')}</span>{' '}
              <span className="bg-gradient-to-r from-[#00d4ff] via-[#00e5ff] to-[#00ff88] bg-clip-text text-transparent">
                {t('hero.title2')}
              </span>
            </h1>
            <h2 className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              {t('hero.subtitle')}
            </h2>
          </div>

          {/* Speed Gauge Section */}
          <article className="glass-card gradient-border rounded-3xl p-6 sm:p-10 mb-8 relative overflow-hidden" aria-label="Speed test meter">
            {/* Background Tech Grid Lines */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
              <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,212,255,0.1) 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
            </div>

            {/* Solar System Motion Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
              {/* Sun (Hidden under gauge but providing glow) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#00d4ff]/10 blur-3xl rounded-full"></div>

              {/* Orbit 1 */}
              <div className="solar-orbit-ring w-48 h-48">
                <div className="orbit-container" style={{ animationDuration: '8s' }}>
                  <div className="planet w-2 h-2 bg-[#00ff88] text-[#00ff88]"></div>
                </div>
              </div>

              {/* Orbit 2 */}
              <div className="solar-orbit-ring w-72 h-72">
                <div className="orbit-container" style={{ animationDuration: '15s', animationDirection: 'reverse' }}>
                  <div className="planet w-3 h-3 bg-[#00d4ff] text-[#00d4ff]"></div>
                </div>
              </div>

              {/* Orbit 3 */}
              <div className="solar-orbit-ring w-[500px] h-[500px]">
                <div className="orbit-container" style={{ animationDuration: '25s' }}>
                  <div className="planet w-2 h-2 bg-[#b84dff] text-[#b84dff]"></div>
                </div>
              </div>

              {/* Orbit 4 - Deep outer */}
              <div className="solar-orbit-ring w-[700px] h-[700px]">
                <div className="orbit-container" style={{ animationDuration: '40s', animationDirection: 'reverse' }}>
                  <div className="planet w-1.5 h-1.5 bg-white opacity-40"></div>
                </div>
              </div>
            </div>

            {/* Main Axis Lines */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-[#00d4ff] to-transparent"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-px bg-gradient-to-b from-transparent via-[#00d4ff] to-transparent"></div>
            </div>

            <div className="flex flex-col items-center relative z-10 animate-reveal">
              {/* Create Account Button - Beside Speed Circle */}
              <div className="w-full flex justify-end mb-4">
                <UserProfile />
              </div>
              
              <SpeedGauge
                speed={displaySpeed}
                maxSpeed={200}
                phase={state.phase}
                isRunning={state.isRunning}
              />

              <p className="mt-4 text-sm text-slate-400 text-center" role="status" aria-live="polite">
                {statusMessage}
              </p>

              {/* Progress bar */}
              {state.isRunning && (
                <div className="w-full max-w-md mt-6">
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>
                      {state.phase === 'ping' && `${t('gauge.measuring')} ping...`}
                      {state.phase === 'download' && `${t('gauge.testing')} ${t('gauge.download')}...`}
                      {state.phase === 'upload' && `${t('gauge.testing')} ${t('gauge.upload')}...`}
                    </span>
                    <span>{Math.round(state.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 progress-shimmer"
                      style={{
                        width: `${state.progress}%`,
                        background: 'linear-gradient(90deg, #00d4ff, #00e5ff, #00ff88)',
                      }}
                    />
                  </div>
                </div>
              )}

              {hasError && (
                <div className="mt-6 w-full max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  <p className="font-medium">Speed test could not complete.</p>
                  <p className="mt-1 text-rose-100/90">{state.error}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                {!state.isRunning && !isDone && (
                  <button
                    onClick={handleStart}
                    disabled={!state.isOnline}
                    className="btn-glow relative px-10 py-4 rounded-2xl bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a0e1a] font-bold text-lg tracking-wide shadow-[0_0_30px_rgba(0,212,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={hasError ? 'Retry speed test' : t('button.start')}
                  >
                    <span className="flex items-center gap-3">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {hasError ? 'Retry Test' : t('button.start')}
                    </span>
                  </button>
                )}

                {state.isRunning && (
                  <button
                    onClick={handleReset}
                    className="px-8 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors border border-slate-700"
                  >
                    {t('button.cancel')}
                  </button>
                )}

                {isDone && (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button
                      onClick={handleStart}
                      className="btn-glow px-8 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a0e1a] font-bold shadow-[0_0_20px_rgba(0,212,255,0.3)]"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {t('button.testAgain')}
                      </span>
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-6 py-3 rounded-xl bg-slate-800/50 text-slate-400 font-medium hover:bg-slate-800 transition-colors border border-slate-700/50"
                    >
                      {t('button.reset')}
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-4 text-xs text-slate-500 text-center max-w-xl">
                This is an approximate browser-based estimate from public test endpoints and device/network conditions.
                It is not a certified ISP compliance measurement.
              </p>
            </div>
          </article>

          {/* Network Health & Comparative Stats */}
          <section className="animate-fade-in-up">
            <NetworkHealth />
            <ComparativeStats />
            {isDone && (
              <>
                <GlobalReportCard userSpeed={state.download} />
                <ShareResults download={state.download} upload={state.upload} ping={state.ping} />
              </>
            )}
            <WeeklyReportSignup />
          </section>

          {/* Server Info Section - Shows YOUR actual WiFi/ISP */}
          <ServerInfo
            isp={ispInfo.isp}
            ip={ispInfo.ip}
            server={ispInfo.server}
            connections="multi"
            isLoading={isIspLoading}
            onConnectionsChange={(type) => console.log('Connection type:', type)}
            onChangeServer={() => setIsServerModalOpen(true)}
            onScanNearby={() => setIsServerModalOpen(true)}
          />

          {/* Result Cards */}
          <section aria-label="Speed test results" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12 animate-fade-in-up">
              <div className="space-y-3">
                <ResultCard
                  icon="📡"
                  label={t('results.ping')}
                  value={state.ping}
                  unit="ms"
                  color="purple"
                  status={getStatusMessage(state.ping, 'ping')}
                  isLoading={state.phase === 'ping'}
                />
                <JitterGraph isRunning={state.isRunning} value={state.jitter} />
              </div>
            <ResultCard
              icon="📥"
              label={t('results.download')}
              value={state.download}
              unit="Mbps"
              color="blue"
              status={getStatusMessage(state.download, 'download')}
              isLoading={state.phase === 'download'}
            />
            <ResultCard
              icon="📤"
              label={t('results.upload')}
              value={state.upload}
              unit="Mbps"
              color="green"
              status={getStatusMessage(state.upload, 'upload')}
              isLoading={state.phase === 'upload'}
            />
          </section>

          {/* History Section - Always show if there are results */}
          <div id="history-section" className="mb-12">
            {(history.length > 0 || showHistory) && (
              <History results={history} onClear={handleClearHistory} />
            )}
          </div>
        </section>

        {/* SEO Content Sections */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-8" aria-labelledby="best-tool">
          <article className="glass-card rounded-2xl p-6 sm:p-8 mb-6">
            <h2 id="best-tool" className="text-xl sm:text-2xl font-bold text-white mb-4">
              🏆 Best Free WiFi Speed Test Tool Online
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-4">
              Our WiFi speed test is a powerful, free internet speed checker that gives you instant, accurate results.
              Whether you call it a <strong className="text-[#00d4ff]">bandwidth test</strong>, <strong className="text-[#00d4ff]">network speed test</strong>,
              or connection check, our tool measures exactly what matters: your real-world download and upload speeds,
              plus the ping that affects gaming and video calls. No downloads, no sign-ups — just click and test.
            </p>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              This internet speed test works on all devices and connections: WiFi, Ethernet, 4G, 5G, and fiber.
              It's the same speed checker technology trusted by millions worldwide to verify their ISP performance
              and troubleshoot slow connections.
            </p>
          </article>

          <article className="glass-card rounded-2xl p-6 sm:p-8 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
              ⚡ Check Your Internet Speed in Seconds
            </h2>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <div className="flex flex-col gap-2">
                <div className="text-3xl">📡</div>
                <h3 className="font-semibold text-white text-sm">Measure Ping</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tests latency in milliseconds. Critical for gaming, video calls, and real-time applications. Lower is better.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-3xl">📥</div>
                <h3 className="font-semibold text-white text-sm">Download Speed</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  How fast you receive data. Affects streaming quality, page loads, and file downloads. Measured in Mbps.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-3xl">📤</div>
                <h3 className="font-semibold text-white text-sm">Upload Speed</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  How fast you send data. Important for video conferencing, cloud backups, and sharing files online.
                </p>
              </div>
            </div>
          </article>

          <article className="glass-card rounded-2xl p-6 sm:p-8 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
              💡 Why Internet Speed Matters
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-4">
              Your internet speed affects everything you do online. Streaming Netflix in 4K requires 25 Mbps or higher.
              Online gaming needs low ping under 50 ms for responsive gameplay. Video calls on Zoom or Teams need
              stable upload and download speeds. Working from home with cloud services like Google Drive or
              Dropbox demands consistent bandwidth.
            </p>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-4">
              If your WiFi speed test shows lower speeds than expected, try moving closer to your router,
              disconnecting unused devices, or connecting via Ethernet. Run multiple tests at different times
              of day to get an accurate picture of your connection quality.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-[#00ff88] font-bold text-lg">25+ Mbps</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">4K Streaming</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-[#00d4ff] font-bold text-lg">{'< 50 ms'}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Gaming Ping</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-[#00e5ff] font-bold text-lg">10+ Mbps</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Upload for Calls</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-[#b84dff] font-bold text-lg">100+ Mbps</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Multi-User</div>
              </div>
            </div>
          </article>
        </section>

        {/* FAQ Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" aria-labelledby="faq-heading">
          <div id="faq-heading" className="sr-only">Frequently Asked Questions</div>
          <FAQ />
        </section>

        {/* Feature Grid Section */}
        <FeatureGrid />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#060a14]" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          {/* Main Footer Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-10">
            {/* SPEEDTEST Column */}
            <div className="col-span-2 md:col-span-1">
              <h3 className="text-white font-bold text-sm mb-4 tracking-wide">SPEEDTEST®</h3>
              <ul className="space-y-2.5">
                <li><button onClick={() => setComingSoonTitle('Account')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Account</button></li>
                <li><button onClick={() => setComingSoonTitle('Advertise')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Advertise</button></li>
                <li><button onClick={() => setComingSoonTitle('Speedtest Awards™')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Speedtest Awards™</button></li>
                <li><button onClick={() => setComingSoonTitle('Speedtest Servers™')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Speedtest Servers™</button></li>
                <li><button onClick={() => setComingSoonTitle('Speedtest Performance Directory™')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Speedtest Performance Directory™</button></li>
              </ul>
              {/* Social Icons */}
              <div className="flex items-center gap-4 mt-6">
                <a href="#" className="text-slate-400 hover:text-white transition-colors" aria-label="Twitter/X">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a href="#" className="text-slate-400 hover:text-white transition-colors" aria-label="Facebook">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a href="#" className="text-slate-400 hover:text-white transition-colors" aria-label="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* ZIFF DAVIS Column */}
            <div>
              <h3 className="text-white font-bold text-sm mb-4 tracking-wide">ZIFF DAVIS</h3>
              <ul className="space-y-2.5">
                <li><button onClick={() => setComingSoonTitle('PCMag')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">PCMag</button></li>
                <li><button onClick={() => setComingSoonTitle('IGN')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">IGN</button></li>
                <li><button onClick={() => setComingSoonTitle('Mashable')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Mashable</button></li>
                <li><button onClick={() => setComingSoonTitle('Lifehacker')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Lifehacker</button></li>
                <li><button onClick={() => setComingSoonTitle('ExtremeTech')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">ExtremeTech</button></li>
              </ul>
            </div>

            {/* OOKLA BRANDS Column */}
            <div>
              <h3 className="text-white font-bold text-sm mb-4 tracking-wide">OOKLA® BRANDS</h3>
              <ul className="space-y-2.5">
                <li><button onClick={() => setComingSoonTitle('Downdetector®')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Downdetector®</button></li>
                <li><button onClick={() => setComingSoonTitle('Ekahau®')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Ekahau®</button></li>
                <li><button onClick={() => setComingSoonTitle('RootMetrics®')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">RootMetrics®</button></li>
                <li><button onClick={() => setComingSoonTitle('Ookla® Intelligence')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Ookla® Intelligence</button></li>
              </ul>
            </div>

            {/* APPS Column */}
            <div className="col-span-2 md:col-span-1">
              <h3 className="text-white font-bold text-sm mb-4 tracking-wide">APPS</h3>
              <ul className="space-y-2.5">
                <li><button onClick={() => setComingSoonTitle('Android App')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Android</button></li>
                <li><button onClick={() => setComingSoonTitle('Apple TV App')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Apple TV</button></li>
                <li><button onClick={() => setComingSoonTitle('iOS App')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">iOS</button></li>
                <li><button onClick={() => setComingSoonTitle('macOS App')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">macOS</button></li>
                <li><button onClick={() => setComingSoonTitle('Windows App')} className="text-slate-400 hover:text-white text-sm transition-colors text-left">Windows</button></li>
              </ul>
            </div>
          </div>

          {/* Copyright Notice */}
          <div className="border-t border-white/5 pt-8">
            <p className="text-center text-xs text-slate-500 mb-6 leading-relaxed">
              © 2006-{new Date().getFullYear()} Ookla, LLC., a Ziff Davis company. All Rights Reserved. Ookla®, Speedtest®, and Speedtest Intelligence® are among the federally registered trademarks of Ookla, LLC and may only be used with explicit written permission.
            </p>

            {/* Legal Links */}
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs">
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Accessibility</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Network Status</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Terms of Use</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Do Not Sell My Personal Information</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Modern Slavery Policy</a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Cookie Policy</a>
            </div>

            {/* Final Developer Section */}
            <div className="mt-12 pt-8 border-t border-white/5 flex flex-col items-center">
              <button 
                onClick={() => setNavSection('about')}
                className="group relative flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#00ff88]/40 transition-all duration-500 hover:bg-[#00ff88]/5 shadow-xl"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center font-bold text-[#0a0e1a] text-sm group-hover:scale-110 transition-transform">
                  HS
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Developed By</div>
                  <div className="text-sm font-bold text-white group-hover:text-[#00ff88] transition-colors">Himank Singh</div>
                </div>
                <div className="ml-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#00ff88]/20 transition-all">
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Server Selection Modal */}
      <ServerModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSelectServer={(server: Server) => {
          setIspInfo((prev) => ({
            ...prev,
            server: {
              id: server.id,
              name: server.name,
              location: server.location,
              country: server.country || 'India',
            },
          }));
        }}
        currentServer={ispInfo.server}
      />

      {/* Language Selection Modal */}
      <LanguageModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        onSelectLanguage={(lang: Language) => {
          changeLanguage(lang.code);
        }}
        currentLanguage={currentLanguageInfo}
      />

      {/* Navigation Info Modal */}
      <NavModal
        isOpen={navSection !== null}
        onClose={() => setNavSection(null)}
        section={navSection}
      />

      {/* Coming Soon Modal */}
      <ComingSoonModal
        isOpen={comingSoonTitle !== null}
        onClose={() => setComingSoonTitle(null)}
        title={comingSoonTitle || ''}
      />

      {/* Voice Assistant */}
      <VoiceAssistant />
    </div>
    </LanguageProvider>
  );
}
