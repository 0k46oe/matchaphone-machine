import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, Disc3, Headphones, Play, RotateCcw, Sparkles, Trash2, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../core/db";
import { useMusicPlayer } from "../core/musicPlayer";
import {
  buildMusicListeningReport,
  clearMusicListeningReports,
  formatListeningDuration,
  generateMusicReportCommentary,
  getMusicReportCommentary,
  getMusicReportPreferences,
  localDateKey,
  periodBounds,
  saveMusicReportPreferences,
  shiftMusicReportAnchor,
  type MusicListeningReport,
} from "../core/musicReport";
import { useStore } from "../core/store";
import type { Character, MusicReportCommentary, MusicReportPeriod } from "../core/types";

const PERIOD_LABELS: Record<MusicReportPeriod, string> = { week: "周报", month: "月报", year: "年度" };
const SOURCE_LABELS = { "local-file": "本地文件", "direct-url": "音频直链", netease: "网易云" } as const;
const TIME_BLOCKS = [
  { name: "清晨", hours: [5, 6, 7, 8, 9, 10] },
  { name: "白天", hours: [11, 12, 13, 14, 15, 16] },
  { name: "傍晚", hours: [17, 18, 19, 20, 21, 22] },
  { name: "深夜", hours: [23, 0, 1, 2, 3, 4] },
];

function shortDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function dayLabel(date: string) { const value = new Date(`${date}T12:00:00`); return ["日", "一", "二", "三", "四", "五", "六"][value.getDay()]; }

export default function MusicReportPage() {
  const navigate = useNavigate(), player = useMusicPlayer(), { provider } = useStore();
  const [period, setPeriod] = useState<MusicReportPeriod>("week"), [anchorDate, setAnchorDate] = useState(localDateKey(Date.now()));
  const [report, setReport] = useState<MusicListeningReport>(), [friends, setFriends] = useState<Character[]>([]), [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [commentary, setCommentary] = useState<MusicReportCommentary | null>(null), [commentBusy, setCommentBusy] = useState(false), [loading, setLoading] = useState(true), [status, setStatus] = useState("");
  const autoKeyRef = useRef("");

  const load = useCallback(async (nextPeriod = period, nextAnchor = anchorDate) => {
    setLoading(true);
    try { setReport(await buildMusicListeningReport(nextPeriod, nextAnchor)); }
    finally { setLoading(false); }
  }, [anchorDate, period]);

  useEffect(() => { void Promise.all([getMusicReportPreferences(), db.characters.toArray()]).then(([preferences, characters]) => {
    setPeriod(preferences.period); setAnchorDate(preferences.anchorDate || localDateKey(Date.now())); setSelectedCharacterId(preferences.selectedCharacterId ?? "");
    setFriends(characters.filter((character) => character.contactState?.status === "friend"));
    return buildMusicListeningReport(preferences.period, preferences.anchorDate || Date.now());
  }).then(setReport).finally(() => setLoading(false)); }, []);

  const selectedCharacter = friends.find((character) => character.id === selectedCharacterId);
  useEffect(() => {
    if (!report || !selectedCharacterId) { setCommentary(null); return; }
    void getMusicReportCommentary(report, selectedCharacterId).then(setCommentary);
  }, [report?.fingerprint, report?.periodKey, selectedCharacterId]);
  useEffect(() => {
    if (!report || !selectedCharacter || !provider || report.totalListenedMs <= 0) return;
    const key = `${report.period}:${report.periodKey}:${selectedCharacter.id}:${report.fingerprint}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key; setCommentBusy(true); setStatus("");
    void generateMusicReportCommentary(report, selectedCharacter, provider).then(setCommentary).catch((error) => setStatus(error instanceof Error ? error.message : "角色点评生成失败")).finally(() => setCommentBusy(false));
  }, [provider, report, selectedCharacter]);

  const changePeriod = (value: MusicReportPeriod) => {
    const today = localDateKey(Date.now()); setPeriod(value); setAnchorDate(today); setCommentary(null); autoKeyRef.current = "";
    void saveMusicReportPreferences({ period: value, anchorDate: today }); void load(value, today);
  };
  const movePeriod = (direction: -1 | 1) => {
    const next = shiftMusicReportAnchor(period, anchorDate, direction); setAnchorDate(next); setCommentary(null); autoKeyRef.current = "";
    void saveMusicReportPreferences({ anchorDate: next }); void load(period, next);
  };
  const chooseCharacter = (id: string) => { setSelectedCharacterId(id); setCommentary(null); autoKeyRef.current = ""; void saveMusicReportPreferences({ selectedCharacterId: id || undefined }); };
  const regenerate = async () => {
    if (!report || !selectedCharacter || !provider) return;
    setCommentBusy(true); setStatus("");
    try { setCommentary(await generateMusicReportCommentary(report, selectedCharacter, provider, true)); }
    catch (error) { setStatus(error instanceof Error ? error.message : "暂时无法重新生成"); }
    finally { setCommentBusy(false); }
  };
  const clearReports = async () => {
    if (!window.confirm("确定清除全部听歌统计与角色点评吗？歌曲、歌单和一起听记录不会被删除。")) return;
    const preferences = await clearMusicListeningReports(); setPeriod(preferences.period); setAnchorDate(preferences.anchorDate); setSelectedCharacterId(""); setCommentary(null); setStatus("听歌统计已清除"); await load(preferences.period, preferences.anchorDate);
  };
  const playReportTrack = async (trackId: string) => { const track = player.tracks.find((item) => item.id === trackId) ?? await db.musicTracks.get(trackId); if (track && !track.unavailableReason) await player.playTrack(track); };

  const maxDaily = Math.max(1, ...(report?.daily.map((day) => day.listenedMs) ?? []));
  const maxMonthly = Math.max(1, ...(report?.monthly.map((month) => month.listenedMs) ?? []));
  const nextDisabled = periodBounds(period, shiftMusicReportAnchor(period, anchorDate, 1)).startAt > Date.now();
  const timeBlocks = useMemo(() => TIME_BLOCKS.map((block) => ({ ...block, listenedMs: block.hours.reduce((sum, hour) => sum + (report?.hourlyMs[hour] ?? 0), 0) })).sort((a, b) => b.listenedMs - a.listenedMs), [report]);
  const maxTimeBlock = Math.max(1, ...timeBlocks.map((block) => block.listenedMs));

  return <main className="music-report-page">
    <header className="music-report-header"><button type="button" aria-label="返回音乐" onClick={() => navigate("/music")}><ArrowLeft aria-hidden="true" /></button><div><small>MUSIC MEMORIES</small><h1>听歌报告</h1></div><button type="button" className="music-report-clear" aria-label="清除听歌统计" onClick={() => void clearReports()}><Trash2 aria-hidden="true" /></button></header>
    <section className="music-report-periods" aria-label="报告周期">{(["week", "month", "year"] as MusicReportPeriod[]).map((item) => <button type="button" key={item} className={period === item ? "active" : ""} onClick={() => changePeriod(item)}>{PERIOD_LABELS[item]}</button>)}</section>
    <div className="music-report-navigator"><button type="button" aria-label="上一期" onClick={() => movePeriod(-1)}><ChevronLeft aria-hidden="true" /></button><div><b>{report?.label ?? "正在整理"}</b><small>{report?.isCurrent ? "本期持续记录中" : "历史报告"}</small></div><button type="button" aria-label="下一期" disabled={nextDisabled} onClick={() => movePeriod(1)}><ChevronRight aria-hidden="true" /></button></div>

    {loading ? <div className="music-report-empty"><Headphones /><span>正在整理你的音乐足迹…</span></div> : !report?.totalListenedMs ? <div className="music-report-empty"><Disc3 /><b>这一期还没有听歌记录</b><span>精确统计从本功能启用后开始，不会估算过去的播放时长。</span><button type="button" onClick={() => navigate("/music")}>去听一首歌</button></div> : <>
      <section className="music-report-hero"><div className="music-report-orbit"><Headphones aria-hidden="true" /></div><small>{PERIOD_LABELS[period]}累计聆听</small><strong>{formatListeningDuration(report.totalListenedMs)}</strong><p>在 {report.activeDays} 天里，遇见了 {report.uniqueTracks} 首歌。</p></section>
      <section className="music-report-stat-grid"><article><Clock3 /><b>{report.activeDays}</b><span>活跃天数</span></article><article><Disc3 /><b>{report.validPlays}</b><span>有效播放</span></article><article><BarChart3 /><b>{report.completes}</b><span>完整听完</span></article><article><CalendarDays /><b>{report.skips}</b><span>提前切歌</span></article></section>

      <section className="music-report-card"><div className="music-report-title"><div><small>LISTENING RHYTHM</small><h2>{period === "year" ? "十二个月的旋律" : period === "month" ? "这个月的声音日历" : "这一周的节奏"}</h2></div></div>
        {period === "year" ? <div className="music-report-month-bars">{report.monthly.map((item) => <div key={item.month}><span style={{ height: `${Math.max(4, item.listenedMs / maxMonthly * 100)}%` }} title={`${item.month + 1}月 ${formatListeningDuration(item.listenedMs)}`} /><small>{item.month + 1}月</small></div>)}</div> : period === "month" ? <div className="music-report-heatmap">{report.daily.map((item) => <div key={item.date} className={`level-${Math.min(4, Math.ceil(item.listenedMs / maxDaily * 4))}`} title={`${item.date} ${formatListeningDuration(item.listenedMs)}`}><small>{Number(item.date.slice(-2))}</small></div>)}</div> : <div className="music-report-week-bars">{report.daily.map((item) => <div key={item.date}><span className="bar"><i style={{ height: `${Math.max(3, item.listenedMs / maxDaily * 100)}%` }} /></span><b>{shortDuration(item.listenedMs)}</b><small>周{dayLabel(item.date)}</small></div>)}</div>}
      </section>

      <section className="music-report-card"><div className="music-report-title"><div><small>TOP TRACKS</small><h2>最常陪伴你的歌</h2></div></div><div className="music-report-ranking">{report.tracks.slice(0, 8).map((track, index) => { const playable = player.tracks.some((item) => item.id === track.trackId && !item.unavailableReason); return <article key={track.trackId}><em>{String(index + 1).padStart(2, "0")}</em><div><b>{track.title}</b><small>{track.artists.join(" / ")} · {formatListeningDuration(track.listenedMs)}</small></div><button type="button" disabled={!playable} aria-label={`播放 ${track.title}`} onClick={() => void playReportTrack(track.trackId)}><Play aria-hidden="true" /></button></article>; })}</div></section>

      <section className="music-report-card music-report-habits"><div className="music-report-title"><div><small>LISTENING HABITS</small><h2>你的聆听习惯</h2></div></div><div className="music-report-habit-list">{timeBlocks.map((block) => <div key={block.name}><span><b>{block.name}</b><small>{formatListeningDuration(block.listenedMs)}</small></span><i><u style={{ width: `${block.listenedMs / maxTimeBlock * 100}%` }} /></i></div>)}</div><div className="music-report-source-list">{report.sources.map((source) => <span key={source.source}><i className={`source-${source.source}`} /><b>{SOURCE_LABELS[source.source]}</b><small>{Math.round(source.listenedMs / report.totalListenedMs * 100)}%</small></span>)}</div><div className="music-report-artists">{report.artists.slice(0, 5).map((artist, index) => <span key={artist.name}><small>#{index + 1}</small><b>{artist.name}</b><em>{formatListeningDuration(artist.listenedMs)}</em></span>)}</div></section>

      <section className="music-report-card"><div className="music-report-title"><div><small>TOGETHER LISTENING</small><h2>陪听回忆</h2></div></div>{report.characters.length ? <div className="music-report-companions">{report.characters.map((item) => { const character = friends.find((friend) => friend.id === item.characterId); return character ? <article key={item.characterId}><span>{character.avatar ? <img src={character.avatar} alt="" /> : <UserRound />}</span><div><b>{character.name}</b><small>一起听了 {formatListeningDuration(item.listenedMs)} · 点歌 {item.selectedCount} 首</small></div></article> : null; })}</div> : <p className="music-report-muted">这期还没有角色陪听记录，独自听歌的时光也被好好保存了。</p>}
        <div className="music-report-commentary"><label htmlFor="music-report-character">选择一位好友写点评</label><select id="music-report-character" value={selectedCharacterId} onChange={(event) => chooseCharacter(event.target.value)}><option value="">暂不生成角色点评</option>{friends.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>{selectedCharacterId ? <div className="music-report-note"><Sparkles aria-hidden="true" /><div>{commentBusy && !commentary ? <p>角色正在翻看这期音乐记录…</p> : commentary ? <p>{commentary.text}</p> : <p>选择角色后会根据真实统计生成点评。</p>}{commentary ? <button type="button" disabled={commentBusy} onClick={() => void regenerate()}><RotateCcw aria-hidden="true" />{commentBusy ? "生成中" : "重新生成"}</button> : null}</div></div> : null}{status ? <small className="music-report-status">{status}</small> : null}</div>
      </section>
    </>}
  </main>;
}