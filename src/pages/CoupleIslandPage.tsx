import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, CalendarDays, Camera, Check, Heart, Home, Mail, Music2, Package, PawPrint, Plus, RotateCcw, ShoppingBag, Sparkles, Sprout, TreePine, Waves, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, Empty, Modal } from "../components/ui";
import { db } from "../core/db";
import { compressImage } from "../core/imageAssets";
import { enqueueChatReply } from "../core/chatReplyTasks";
import { canCharacterInteract } from "../core/conversationSettings";
import {
  COUPLE_ISLAND_CATALOG,
  addIslandEntry,
  archiveCoupleIsland,
  buyIslandCatalogItem,
  completeIslandWish,
  createCoupleIslandInvitation,
  ISLAND_INVITE_RETRY_MS,
  latestCoupleIslandInvitation,
  interactIslandPet,
  placeIslandObject,
  queueIslandFirstOpenUpdate,
  restoreCoupleIsland,
  storeIslandObject,
  unlockedIslandZones,
  waterIslandPlant,
} from "../core/coupleIsland";
import type { Character, Conversation, CoupleIsland, CoupleIslandEntry, CoupleIslandEvent, CoupleIslandObject, CoupleIslandZone, ImageAsset, Message } from "../core/types";

type View = "map" | "memories" | "inventory" | "shop";
type IslandBundle = { island: CoupleIsland; character?: Character; conversation?: Conversation };
const zoneInfo: Record<CoupleIslandZone, { name: string; icon: typeof Home; level: number; subtitle: string }> = {
  home: { name: "双人小屋", icon: Home, level: 1, subtitle: "布置属于你们的共同空间" },
  beach: { name: "回忆海滩", icon: Waves, level: 1, subtitle: "沿着潮汐翻阅共同经历" },
  garden: { name: "岛屿花园", icon: Sprout, level: 2, subtitle: "植物只会等待，不会枯萎" },
  "wish-tree": { name: "心愿树", icon: TreePine, level: 3, subtitle: "把想一起做的事挂在树上" },
  "pet-cove": { name: "宠物湾", icon: PawPrint, level: 4, subtitle: "陪伴不会变成负担" },
  "music-dock": { name: "音乐码头", icon: Music2, level: 5, subtitle: "保存最近一起听过的歌" },
};
const relativeDay = (time?: number) => time ? Math.max(1, Math.floor((Date.now() - time) / 86400000) + 1) : 1;
const dateText = (time: number) => new Date(time).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
const catalogOf = (object: CoupleIslandObject) => COUPLE_ISLAND_CATALOG.find((item) => item.id === object.catalogId);

export default function CoupleIslandPage() {
  const nav = useNavigate(), fileRef = useRef<HTMLInputElement>(null), mapRef = useRef<HTMLDivElement>(null);
  const [characters, setCharacters] = useState<Character[]>([]), [conversations, setConversations] = useState<Conversation[]>([]), [islands, setIslands] = useState<CoupleIsland[]>([]), [invitations, setInvitations] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string>(), [objects, setObjects] = useState<CoupleIslandObject[]>([]), [entries, setEntries] = useState<CoupleIslandEntry[]>([]), [events, setEvents] = useState<CoupleIslandEvent[]>([]), [assets, setAssets] = useState<Map<string, ImageAsset>>(new Map());
  const [view, setView] = useState<View>("map"), [zone, setZone] = useState<CoupleIslandZone | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [draft, setDraft] = useState(""), [entryKind, setEntryKind] = useState<"wish" | "diary">("wish"), [dragging, setDragging] = useState<string>(), [draftObjects, setDraftObjects] = useState<CoupleIslandObject[]>([]), [showArchive, setShowArchive] = useState(false);

  const load = async (preferred?: string) => {
    const [characterRows, conversationRows, islandRows, invitationRows, imageRows] = await Promise.all([
      db.characters.toArray(),
      db.conversations.where("type").equals("private").toArray(),
      db.coupleIslands.toArray(),
      db.messages.where("kind").equals("couple-island-invitation").toArray(),
      db.imageAssets.where("purpose").equals("couple-island").toArray(),
    ]);
    const sortedIslands = islandRows.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    setCharacters(characterRows); setConversations(conversationRows); setIslands(sortedIslands); setInvitations(invitationRows.sort((a, b) => b.createdAt - a.createdAt)); setAssets(new Map(imageRows.map((asset) => [asset.id, asset])));
    const requestedId = preferred ?? selectedId, available = sortedIslands.find((item) => item.id === requestedId && (item.status === "active" || item.status === "archived"));
    const id = available?.id; setSelectedId(id);
    if (id) {
      const [objectRows, entryRows, eventRows] = await Promise.all([db.coupleIslandObjects.where("islandId").equals(id).toArray(), db.coupleIslandEntries.where("islandId").equals(id).reverse().sortBy("createdAt"), db.coupleIslandEvents.where("islandId").equals(id).reverse().sortBy("createdAt")]);
      setObjects(objectRows); setDraftObjects(objectRows); setEntries(entryRows); setEvents(eventRows);
    } else { setObjects([]); setDraftObjects([]); setEntries([]); setEvents([]); }
  };
  useEffect(() => { void load(); }, []);

  const bundles = useMemo<IslandBundle[]>(() => islands.filter((item) => item.status === "active" || item.status === "archived").map((island) => ({ island, character: characters.find((item) => item.id === island.characterId), conversation: conversations.find((item) => item.id === island.conversationId) })), [islands, characters, conversations]);
  const selected = bundles.find((item) => item.island.id === selectedId), island = selected?.island, character = selected?.character;
  useEffect(() => { if (island?.status === "active") void queueIslandFirstOpenUpdate(island.id); }, [island?.id, island?.status]);
  const invitationMap = useMemo(() => {
    const map = new Map<string, { message: Message; attachment: Extract<NonNullable<Message["attachments"]>[number], { type: "couple-island-invitation" }> }>();
    for (const message of invitations) {
      const attachment = message.attachments?.find((item) => item.type === "couple-island-invitation" && item.cardRole !== "response");
      if (attachment?.type === "couple-island-invitation" && !map.has(attachment.characterId)) map.set(attachment.characterId, { message, attachment });
    }
    return map;
  }, [invitations]);
  const unlocked = island ? unlockedIslandZones(island.level) : [];
  const placedObjects = draftObjects.filter((item) => item.location === "placed"), inventory = objects.filter((item) => item.location === "inventory");

  const invite = async (target: Character) => {
    if (!canCharacterInteract(target)) { setNotice("请先添加该角色为好友"); return; }
    const conversation = conversations.find((row) => row.memberIds.length === 1 && row.memberIds.includes(target.id));
    if (!conversation) { setNotice("请先与该角色建立私聊"); return; }
    setBusy(true);
    try { await createCoupleIslandInvitation({ conversationId: conversation.id, characterId: target.id }); await enqueueChatReply({ conversationId: conversation.id, mode: "private" }); await load(); setNotice("邀请已发送，等待角色回应"); nav(`/messages/${conversation.id}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "邀请发送失败"); }
    finally { setBusy(false); }
  };
  const addTextEntry = async () => { if (!island || !draft.trim()) return; setBusy(true); try { await addIslandEntry({ islandId: island.id, kind: entryKind, authorType: "user", text: draft, state: entryKind === "wish" ? "active" : undefined }); setDraft(""); await load(island.id); setNotice(entryKind === "wish" ? "心愿已经挂到树上" : "日记已经保存"); } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); } };
  const addPhoto = async (file?: File) => { if (!file || !island) return; setBusy(true); try { const asset = await compressImage(file, "couple-island", 1600, 900000); await db.imageAssets.put(asset); await addIslandEntry({ islandId: island.id, kind: "photo", authorType: "user", text: file.name.replace(/\.[^.]+$/, "") || "岛屿照片", assetIds: [asset.id] }); await load(island.id); setNotice("照片已放入回忆海滩"); } catch (error) { setNotice(error instanceof Error ? error.message : "照片保存失败"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } };
  const buy = async (catalogId: string) => { if (!island) return; setBusy(true); try { await buyIslandCatalogItem(island.id, catalogId); await load(island.id); setNotice("物品已经放进仓库"); } catch (error) { setNotice(error instanceof Error ? error.message : "购买失败"); } finally { setBusy(false); } };
  const putFromInventory = async (object: CoupleIslandObject) => { if (!island) return; try { await placeIslandObject(object.id, object.zone, 50, 55); await load(island.id); setView("map"); setNotice("已放到岛上，可以长按拖动调整位置"); } catch (error) { setNotice(error instanceof Error ? error.message : "摆放失败"); } };
  const actObject = async (object: CoupleIslandObject) => { if (!island || island.status !== "active") return; const result = object.kind === "plant" ? await waterIslandPlant(object.id) : object.kind === "pet" ? await interactIslandPet(object.id, "玩了一会儿") : undefined; if (result && !result.executed) setNotice(result.reason ?? "今天已经互动过了"); else if (result) setNotice(object.kind === "plant" ? "浇过水了，植物会慢慢长大" : "宠物看起来很开心"); await load(island.id); };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragging || !mapRef.current || island?.status !== "active") return; const rect = mapRef.current.getBoundingClientRect(), x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100)), y = Math.max(7, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100)); setDraftObjects((rows) => rows.map((item) => item.id === dragging ? { ...item, x, y } : item)); };
  const finishDrag = async () => { if (!dragging || !island) return; const object = draftObjects.find((item) => item.id === dragging); setDragging(undefined); if (object) { await placeIslandObject(object.id, object.zone, object.x ?? 50, object.y ?? 50); await load(island.id); } };

  if (!island) return <div className="couple-island-page island-roster-page">
    <header className="island-topbar"><button onClick={() => nav("/")} aria-label="返回桌面"><ArrowLeft /></button><div><small>COUPLE ISLAND</small><h1>茶侣岛</h1></div></header>
    <section className="island-roster-hero"><span>🏝️</span><h2>和喜欢的角色，拥有一座只属于你们的小岛</h2><p>只有角色接受邀请后，共同小岛才会正式开放。</p></section>
    <section className="island-character-list"><h3>角色列表</h3>{characters.map((partner) => {
      const partnerIsland = bundles.find((item) => item.island.characterId === partner.id)?.island, invitation = invitationMap.get(partner.id)?.attachment, friend = canCharacterInteract(partner), retryAt = invitation?.state === "declined" ? (invitation.processedAt ?? 0) + ISLAND_INVITE_RETRY_MS : 0, retryReady = !retryAt || retryAt <= Date.now();
      const detail = partnerIsland?.status === "active" ? `Lv.${partnerIsland.level} · ${partnerIsland.heartShells} 心贝` : partnerIsland?.status === "archived" ? "只读纪念岛 · 随时可以恢复" : !friend ? "需要先添加为好友" : invitation?.state === "pending" ? "邀请已发送 · 等待回应" : invitation?.state === "declined" ? `${invitation.reason || "这次邀请暂未接受"}${retryReady ? " · 可以再次邀请" : ` · ${Math.max(1, Math.ceil((retryAt - Date.now()) / 3600000))} 小时后可重试`}` : "尚未建立茶侣岛";
      return <article key={partner.id} className={`island-roster-item ${partnerIsland?.status ?? invitation?.state ?? (friend ? "available" : "not-friend")}`}><Avatar text={partner.name} src={partner.avatar} /><div><b>{partner.name}</b><small>{detail}</small></div>{partnerIsland ? <button onClick={() => { setView("map"); void load(partnerIsland.id); }}>{partnerIsland.status === "archived" ? "查看" : "进入"}</button> : invitation?.state === "pending" ? <button disabled>等待</button> : <button disabled={busy || !friend || !retryReady} onClick={() => void invite(partner)}>{friend ? (invitation?.state === "declined" ? "再次邀请" : "邀请") : "先加好友"}</button>}</article>;
    })}{!characters.length && <Empty icon={<Heart />} title="还没有角色" text="先在角色 App 中创建角色，再邀请 TA 来到茶侣岛。" />}</section>
    {notice && <button className="island-toast" onClick={() => setNotice("")}>{notice}</button>}
  </div>;
  return <div className={`couple-island-page theme-${island.themeId} ${island.status}`}>
    <header className="island-topbar"><button onClick={() => setSelectedId(undefined)} aria-label="返回角色列表"><ArrowLeft /></button><button className="island-partner-switch" onClick={() => setSelectedId(undefined)}><span>{character ? <Avatar text={character.name} src={character.avatar} /> : "♡"}</span><div><small>第 {relativeDay(island.startedAt)} 天 · Lv.{island.level}</small><h1>{island.name}</h1></div></button><button onClick={() => setShowArchive(true)} aria-label="岛屿设置"><Archive /></button></header>
    <section className="island-status-strip"><span><Heart />{island.heartShells} 心贝</span><span><Sparkles />{island.experience} 经验</span><span>{island.weather === "晴朗" ? "☀️" : "☁️"}{island.weather}</span></section>

    {view === "map" && <main className="island-map-view">
      <div className="island-map" ref={mapRef} onPointerMove={pointerMove} onPointerUp={() => void finishDrag()} onPointerCancel={() => void finishDrag()}>
        <div className="island-sea"><i /><i /><i /></div><div className="island-land"><span className="island-grass" /><span className="island-path" /></div>
        {(Object.entries(zoneInfo) as Array<[CoupleIslandZone, typeof zoneInfo[CoupleIslandZone]]>).map(([key, info]) => { const Icon = info.icon, open = unlocked.includes(key); return <button key={key} className={`island-hotspot zone-${key} ${open ? "" : "locked"}`} onClick={() => open ? setZone(key) : setNotice(`${info.name}将在岛屿 ${info.level} 级解锁`)}><span><Icon /></span><b>{info.name}</b>{!open && <em>Lv.{info.level}</em>}</button>; })}
        {placedObjects.map((object) => { const item = catalogOf(object); return <button key={object.id} className={`island-placed-object ${object.kind}`} style={{ left: `${object.x ?? 50}%`, top: `${object.y ?? 50}%`, zIndex: object.layer ?? 5 }} onPointerDown={(event) => { if (island.status !== "active") return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(object.id); }} onClick={() => void actObject(object)} aria-label={item?.name ?? "岛屿物品"}><span>{item?.emoji ?? "♡"}</span>{object.kind === "plant" && <i style={{ width: `${Math.min(100, Number(object.state?.growthPoints ?? 0) * 3)}%` }} />}</button>; })}
        <div className="island-couple-marker"><span>{character ? <Avatar text={character.name} src={character.avatar} /> : "♡"}</span><span className="user-island-avatar">我</span><Heart /></div>
      </div>
      <p className="island-map-hint">点击地点进入 · 长按岛上物品拖动摆放</p>
      {zone && <section className="island-zone-sheet"><button className="island-zone-close" onClick={() => setZone(null)}><X /></button><header>{(() => { const Icon = zoneInfo[zone].icon; return <Icon />; })()}<div><h2>{zoneInfo[zone].name}</h2><p>{zoneInfo[zone].subtitle}</p></div></header>
        {zone === "home" && <div className="island-home-summary"><div><b>{character?.name ?? "TA"} × 我</b><span>共同生活第 {relativeDay(island.startedAt)} 天</span></div><button onClick={() => setView("inventory")}><Package />布置小屋</button></div>}
        {zone === "beach" && <div className="island-entry-grid">{entries.filter((entry) => ["memory", "photo", "milestone"].includes(entry.kind)).slice(0, 8).map((entry) => <article key={entry.id}>{entry.assetIds?.[0] && assets.get(entry.assetIds[0]) ? <img src={assets.get(entry.assetIds[0])!.data} alt="" /> : <Waves />}<b>{entry.title || entry.text}</b><small>{dateText(entry.createdAt)}</small></article>)}<button className="island-add-photo" onClick={() => fileRef.current?.click()}><Camera /><b>添加照片</b></button></div>}
        {zone === "garden" && <div className="island-object-list">{objects.filter((item) => item.kind === "plant").map((item) => <button key={item.id} onClick={() => void actObject(item)}><span>{catalogOf(item)?.emoji}</span><div><b>{catalogOf(item)?.name}</b><small>成长阶段 {Number(item.state?.stage ?? 0)} / 4</small></div><Sprout /></button>)}</div>}
        {zone === "wish-tree" && <div><div className="island-quick-compose"><textarea value={entryKind === "wish" ? draft : ""} onFocus={() => setEntryKind("wish")} onChange={(event) => { setEntryKind("wish"); setDraft(event.target.value); }} placeholder="写下想一起完成的事…" /><button disabled={busy || !draft.trim()} onClick={() => void addTextEntry()}><Plus /></button></div><div className="island-wish-list">{entries.filter((entry) => entry.kind === "wish").map((entry) => <article key={entry.id} className={entry.state}><span>🎀</span><p>{entry.text}</p>{entry.state === "active" && island.status === "active" && <button onClick={async () => { await completeIslandWish(entry.id); await load(island.id); }}><Check /></button>}</article>)}</div></div>}
        {zone === "pet-cove" && <div className="island-object-list">{objects.filter((item) => item.kind === "pet").map((item) => <button key={item.id} onClick={() => void actObject(item)}><span>{catalogOf(item)?.emoji}</span><div><b>{String(item.state?.name ?? catalogOf(item)?.name)}</b><small>亲近度 {Number(item.state?.bond ?? 0)} · {String(item.state?.mood ?? "安心")}</small></div><PawPrint /></button>)}{!objects.some((item) => item.kind === "pet") && <p className="island-zone-empty">去心贝小铺领养一位不会离开的伙伴吧。</p>}</div>}
        {zone === "music-dock" && <div className="island-music-link"><Music2 /><div><b>一起听过的旋律，会留在码头的风里</b><small>打开音乐 App 查看当前歌曲和队列</small></div><button onClick={() => nav("/music")}>打开</button></div>}
      </section>}
    </main>}

    {view === "memories" && <main className="island-journal-view"><section className="island-journal-compose"><div><button className={entryKind === "wish" ? "active" : ""} onClick={() => setEntryKind("wish")}>心愿</button><button className={entryKind === "diary" ? "active" : ""} onClick={() => setEntryKind("diary")}>日记</button></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={entryKind === "wish" ? "想和 TA 一起做什么？" : "记下今天发生的事…"} /><button disabled={busy || island.status !== "active" || !draft.trim()} onClick={() => void addTextEntry()}>保存</button></section><section className="island-timeline">{entries.map((entry) => <article key={entry.id} className={`entry-${entry.kind}`}><span>{entry.kind === "letter" ? <Mail /> : entry.kind === "wish" ? <TreePine /> : entry.kind === "photo" ? <Camera /> : <CalendarDays />}</span><div>{entry.assetIds?.[0] && assets.get(entry.assetIds[0]) && <img src={assets.get(entry.assetIds[0])!.data} alt="" />}<small>{entry.authorType === "character" ? character?.name : entry.authorType === "both" ? "我们" : "我"} · {dateText(entry.createdAt)}</small><b>{entry.title}</b><p>{entry.text}</p></div></article>)}{!entries.length && <Empty icon={<Waves />} title="海滩还很安静" text="共同经历、照片、信件和日记会出现在这里。" />}</section><section className="island-event-log"><h3>最近发生</h3>{events.slice(0, 12).map((event) => <p key={event.id}><span>{dateText(event.createdAt)}</span>{event.summary}{event.reward && <em>+{event.reward.heartShells} 心贝</em>}</p>)}</section></main>}

    {view === "inventory" && <main className="island-inventory-view"><header><Package /><div><h2>岛屿仓库</h2><p>放到岛上后可以长按拖动位置</p></div></header>{inventory.length ? <div className="island-inventory-grid">{inventory.map((object) => <article key={object.id}><span>{catalogOf(object)?.emoji}</span><b>{catalogOf(object)?.name}</b><small>{zoneInfo[object.zone].name}</small><button disabled={island.status !== "active"} onClick={() => void putFromInventory(object)}>摆放</button></article>)}</div> : <Empty icon={<Package />} title="仓库是空的" text="从心贝小铺获得新的家具、植物和伙伴。" />}<h3>已经摆放</h3><div className="island-inventory-grid placed">{objects.filter((item) => item.location === "placed").map((object) => <article key={object.id}><span>{catalogOf(object)?.emoji}</span><b>{catalogOf(object)?.name}</b><button disabled={island.status !== "active"} onClick={async () => { await storeIslandObject(object.id); await load(island.id); }}>收回</button></article>)}</div></main>}

    {view === "shop" && <main className="island-shop-view"><header><ShoppingBag /><div><h2>心贝小铺</h2><p>心贝只来自你们真实的共同互动</p></div><b>{island.heartShells} ♡</b></header><div className="island-shop-grid">{COUPLE_ISLAND_CATALOG.filter((item) => item.price > 0).map((item) => <article key={item.id} className={island.level < item.unlockLevel ? "locked" : ""}><span>{item.emoji}</span><div><b>{item.name}</b><small>{item.description}</small><em>{island.level < item.unlockLevel ? `Lv.${item.unlockLevel} 解锁` : `${item.price} 心贝`}</em></div><button disabled={busy || island.status !== "active" || island.level < item.unlockLevel} onClick={() => void buy(item.id)}>获得</button></article>)}</div></main>}

    <nav className="island-bottom-nav"><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Home /><span>小岛</span></button><button className={view === "memories" ? "active" : ""} onClick={() => setView("memories")}><Waves /><span>回忆</span></button><button className={view === "inventory" ? "active" : ""} onClick={() => setView("inventory")}><Package /><span>仓库</span></button><button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}><ShoppingBag /><span>小铺</span></button></nav>
    <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => void addPhoto(event.target.files?.[0])} />
    {notice && <button className="island-toast" onClick={() => setNotice("")}>{notice}</button>}
    {showArchive && <Modal onClose={() => setShowArchive(false)}><div className="island-settings-sheet"><button type="button" className="sheet-close" aria-label="关闭" onClick={() => setShowArchive(false)}><X /></button><span className="island-settings-emoji">🏝️</span><h2>{island.status === "archived" ? "恢复茶侣岛" : "封存这座岛？"}</h2><p>{island.status === "archived" ? "恢复后可以继续布置、养成和获得心贝。" : "岛屿会变成只读纪念册，所有家具、日记、照片和共同经历都会保留。"}</p><button className="primary" onClick={async () => { if (island.status === "archived") await restoreCoupleIsland(island.id); else await archiveCoupleIsland(island.id); setShowArchive(false); await load(island.id); }}>{island.status === "archived" ? <><RotateCcw />恢复小岛</> : <><Archive />封存回忆</>}</button></div></Modal>}
  </div>;
}