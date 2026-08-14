import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, Save, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../components/ui";
import { setSetting } from "../core/db";
import { compressImage } from "../core/imageAssets";
import { useStore } from "../core/store";
import { USER_PERSONA_MAX_LENGTH } from "../core/userPersona";
import {
  clearPersonaDraft,
  createPersonaDraft,
  readPersonaDraft,
  writePersonaDraft,
  type PersonaDraftV2,
} from "../core/userPersonaDraft";

export default function UserPersonaPage() {
  const nav = useNavigate(),
    { settings, reload } = useStore(),
    fileRef = useRef<HTMLInputElement>(null),
    mountedRef = useRef(true),
    dirtyRef = useRef(false),
    hydratedRef = useRef(false),
    snapshotRef = useRef<PersonaDraftV2 | null>(null),
    writeChainRef = useRef<Promise<void>>(Promise.resolve()),
    [name, setName] = useState(settings?.userName ?? "我"),
    [nickname, setNickname] = useState(settings?.userNickname ?? settings?.userName ?? "我"),
    [bio, setBio] = useState(settings?.userBio ?? ""),
    [persona, setPersona] = useState(settings?.userPersona ?? ""),
    [avatar, setAvatar] = useState(settings?.userAvatar ?? ""),
    [saving, setSaving] = useState(false),
    [avatarSaving, setAvatarSaving] = useState(false),
    [notice, setNotice] = useState("");

  const applyDraft = useCallback((draft: PersonaDraftV2) => {
    snapshotRef.current = draft;
    dirtyRef.current = true;
    setName(draft.name);
    setNickname(draft.nickname);
    setBio(draft.bio);
    setPersona(draft.persona);
    setAvatar(draft.avatar);
  }, []);

  const queueDraftWrite = useCallback((draft: PersonaDraftV2) => {
    writeChainRef.current = writeChainRef.current
      .catch(() => undefined)
      .then(() => writePersonaDraft(draft));
    return writeChainRef.current;
  }, []);

  const flushLatestDraft = useCallback(() => {
    const draft = snapshotRef.current;
    if (!dirtyRef.current || !draft) return Promise.resolve();
    return queueDraftWrite({ ...draft, updatedAt: Date.now() });
  }, [queueDraftWrite]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void readPersonaDraft().then((draft) => {
      if (!active) return;
      hydratedRef.current = true;
      if (draft && !dirtyRef.current) applyDraft(draft);
    });
    return () => {
      active = false;
      mountedRef.current = false;
      void flushLatestDraft();
    };
  }, [applyDraft, flushLatestDraft]);

  useEffect(() => {
    if (!settings || dirtyRef.current) return;
    setName(settings.userName ?? "我");
    setNickname(settings.userNickname ?? settings.userName ?? "我");
    setBio(settings.userBio ?? "");
    setPersona(settings.userPersona ?? "");
    setAvatar(settings.userAvatar ?? "");
  }, [settings]);

  useEffect(() => {
    if (!dirtyRef.current || !hydratedRef.current) return;
    const draft = createPersonaDraft({ name, nickname, bio, persona, avatar, updatedAt: Date.now() });
    snapshotRef.current = draft;
    const timer = window.setTimeout(() => void queueDraftWrite(draft), 250);
    return () => window.clearTimeout(timer);
  }, [name, nickname, bio, persona, avatar, queueDraftWrite]);

  useEffect(() => {
    const onPageHide = () => void flushLatestDraft(),
      onVisibility = () => {
        if (document.visibilityState === "hidden") void flushLatestDraft();
      },
      onPageShow = (event: PageTransitionEvent) => {
        if (!event.persisted || dirtyRef.current) return;
        void readPersonaDraft().then((draft) => {
          if (mountedRef.current && draft && !dirtyRef.current) applyDraft(draft);
        });
      };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyDraft, flushLatestDraft]);

  if (!settings) return null;

  const markDirty = () => {
    dirtyRef.current = true;
    hydratedRef.current = true;
  };
  const chooseAvatar = async (file?: File) => {
    if (!file || avatarSaving) return;
    setAvatarSaving(true);
    setNotice("");
    try {
      const image = await compressImage(file, "icon", 1024, 700_000);
      markDirty();
      setAvatar(image.data);
    } catch {
      setNotice("头像处理失败，请换一张图片重试。");
    } finally {
      setAvatarSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName || saving) return;
    setSaving(true);
    setNotice("");
    markDirty();
    const draft = createPersonaDraft({ name, nickname, bio, persona, avatar, updatedAt: Date.now() });
    snapshotRef.current = draft;
    try {
      await queueDraftWrite(draft);
      await setSetting("app", {
        ...settings,
        userName: cleanName.slice(0, 30),
        userNickname: nickname.trim().slice(0, 30) || cleanName.slice(0, 30),
        userBio: bio.trim().slice(0, 160),
        userAvatar: avatar,
        userPersona: persona.trim().slice(0, USER_PERSONA_MAX_LENGTH),
      });
      await reload();
      await clearPersonaDraft();
      dirtyRef.current = false;
      snapshotRef.current = null;
      if (mountedRef.current) setNotice("我的人设已保存");
    } catch {
      dirtyRef.current = true;
      await flushLatestDraft().catch(() => undefined);
      if (mountedRef.current) setNotice("保存失败，请稍后重试。");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return <div className="app-page user-persona-page"><header className="character-app-header user-persona-header"><button aria-label="返回我的人设" onClick={() => nav("/characters?view=persona")}><ChevronLeft /></button><h1>my persona</h1><button className="user-persona-save-top" aria-label="保存我的人设" disabled={!name.trim() || saving} onClick={() => void save()}><Save /></button></header><main className="user-persona-scroll"><section className="user-persona-profile"><button className="user-persona-avatar" onClick={() => fileRef.current?.click()} aria-label="更换我的头像"><Avatar text={name || "我"} src={avatar} size="lg" /><span><Camera /></span></button><small>MY ONLY PERSONA</small><h2>{name.trim() || "我的人设"}</h2><p>{bio.trim() || "写下一点关于自己的介绍。"}</p><i><Sparkles /> 全局身份</i></section><section className="user-persona-form"><label>名称 <em>必填</em><input value={name} maxLength={30} onChange={(event) => { markDirty(); setName(event.target.value); }} placeholder="你希望角色怎样称呼你" /></label><label>昵称<input value={nickname} maxLength={30} onChange={(event) => { markDirty(); setNickname(event.target.value); }} placeholder="仅显示在消息 App 的“我的”页面" /></label><label>简介 <span>{bio.length}/160</span><textarea rows={3} value={bio} maxLength={160} onChange={(event) => { markDirty(); setBio(event.target.value); }} placeholder="一句话介绍自己" /></label><label>详细人设 <span>{persona.length}/{USER_PERSONA_MAX_LENGTH}</span><textarea rows={10} value={persona} maxLength={USER_PERSONA_MAX_LENGTH} onChange={(event) => { markDirty(); setPersona(event.target.value); }} placeholder="性格、经历、偏好、与角色相处时需要知道的事情……" /></label><button className="user-persona-save" disabled={!name.trim() || saving} onClick={() => void save()}><UserRound />{saving ? "保存中…" : "保存我的人设"}</button>{notice && <p className="user-persona-notice" role="status">{notice}</p>}</section></main><input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => void chooseAvatar(event.target.files?.[0])} /></div>;
}


