/* eslint-disable no-use-before-define */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from './supabase';
import "./App.css";
import pencilIcon from './pencil_icon.png';
import calendarIcon from './calendar_icon_raw.png';
import journalIcon from './journal_icon.png';
import { setupFCM, scheduleNotification, cancelNotification } from './notifications';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d) => d.toISOString().slice(0, 10);
const fmtOff = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return fmt(r); };
const fmtT = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
};
const fmtSecs = (s) => {
  const total = Math.floor(Math.max(0, s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const parseDur = (str) => {
  const s = str.trim();
  if (!s) return 0;
  const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const secs = parseInt(colonMatch[2], 10);
    if (secs > 59) return 0;
    return parseInt(colonMatch[1], 10) * 60 + secs;
  }
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n * 60;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

let nextId = 200;
const uid = () => ++nextId;

// ── Dot counter for routines ──────────────────────────────────────────────────
function Dots({ done, total }) {
  if (total <= 6) {
    return (
      <span className="dots">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ color: i < done ? "var(--terra)" : "var(--border2)" }}>
            {i < done ? "●" : "○"}
          </span>
        ))}
      </span>
    );
  }
  return <span className="dots-num">{done}/{total}</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ type, onClose, onSave, today, editData }) {
  const [name, setName] = useState(editData?.name || "");
  const [time, setTime] = useState(editData?.time || "");
  const [date, setDate] = useState(editData?.date || fmt(today));
  const [notes, setNotes] = useState(editData?.notes || "");
  const [rep, setRep] = useState(editData?.rep || 1);
  const [timerInput, setTimerInput] = useState(editData?.timerDur ? fmtSecs(editData.timerDur) : "");
  const [subs, setSubs] = useState(editData?.subs || []);
  const [subInput, setSubInput] = useState("");
  const [endTime, setEndTime] = useState(editData?.endTime || "");
  const [reminder, setReminder] = useState(editData?.reminder || 0);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), time: time || null, endTime: endTime || null, date: date || fmt(today), notes, rep, timerDur: parseDur(timerInput), subs, reminder });
    onClose();
  };

  const isEdit = !!editData;
  const config = {
    todo:  { label: isEdit ? "Edit task" : "New task",   sub: "Add a task or daily routine",    btn: isEdit ? "Save changes →" : "Add to list →" },
    event: { label: isEdit ? "Edit event" : "New event", sub: "Add something to your calendar", btn: isEdit ? "Save changes →" : "Add to calendar →" },
  }[type];

  return (
    <div className="overlay open" onClick={onClose}>
      <div className={`modal ${type}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{config.label}</div>
        <div className="modal-sub">{config.sub}</div>

        <div className="field">
          <label>{type === "event" ? "EVENT NAME" : "TASK NAME"}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={type === "routine" ? "e.g. Brush teeth, Morning walk…" : type === "event" ? "What's happening?" : "What needs doing?"}
          />
        </div>

        <div className="field-row">
          {(type === "event" || type === "todo") && (
            <div className="field">
              <label>DATE{type === "todo" ? " (optional)" : ""}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>START TIME {type !== "event" ? "(optional)" : ""}</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {type === "event" && (
            <div className="field">
              <label>END TIME (optional)</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
          {type === "todo" && (
            <div className="field">
              <label>REPEAT / DAY</label>
              <div className="rep-row">
                <button className="rb" onClick={() => setRep(Math.max(1, rep - 1))}>−</button>
                <span className="rv">{rep}</span>
                <button className="rb" onClick={() => setRep(Math.min(10, rep + 1))}>+</button>
                <span className="rep-label">× per day</span>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>NOTES (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details…"
          />
        </div>

        {type === "event" && (
          <div className="field">
            <label>REMIND ME</label>
            <select value={reminder} onChange={e => setReminder(Number(e.target.value))}>
              <option value={0}>No reminder</option>
              <option value={5}>5 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={120}>2 hours before</option>
              <option value={1440}>1 day before</option>
            </select>
          </div>
        )}

        {type === "todo" && (
          <div className="field">
            <label>TIMER (optional) — m:ss</label>
            <input
              value={timerInput}
              onChange={(e) => setTimerInput(e.target.value)}
              placeholder="e.g. 5:00 or 0:30"
            />
          </div>
        )}

        {isEdit && type === "todo" && (
          <div className="field">
            <label>SUBTASKS</label>
            <div className="modal-subs">
              {subs.map((s) => (
                <div key={s.id} className={`modal-sub-item${s.done ? " dn" : ""}`}>
                  <button className={`chk${s.done ? " dn" : ""}`} onClick={() => setSubs((p) => p.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))}>
                    {s.done && "✓"}
                  </button>
                  <span className="snm">{s.name}</span>
                  <button className="delbtn" onClick={() => setSubs((p) => p.filter((x) => x.id !== s.id))}>✕</button>
                </div>
              ))}
              <div className="sir">
                <input
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { if (subInput.trim()) { setSubs((p) => [...p, { id: uid(), name: subInput.trim(), done: false }]); setSubInput(""); } } }}
                  placeholder={type === "routine" ? "Add sub-routine…" : "Add subtask…"}
                />
                <button onClick={() => { if (subInput.trim()) { setSubs((p) => [...p, { id: uid(), name: subInput.trim(), done: false }]); setSubInput(""); } }}>+</button>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave}>{config.btn}</button>
        </div>
      </div>
    </div>
  );
}


// ── Todo item ─────────────────────────────────────────────────────────────────
function TodoItem({ t, onToggle, onDelete, onEdit, onTimerOpen }) {
  const tot = t.tot || 1;
  const isRepeating = tot > 1;
  const isDone = isRepeating ? t.done >= tot : t.done;
  const subDone = t.subs.filter((s) => s.done).length;
  const hasTimer = (t.timerDur || 0) > 0;

  return (
    <div className={`it${isDone ? " dn" : ""}`}>
      {isRepeating ? (
        <button className="cbtn" onClick={() => onToggle(t.id)} title="Tap to mark">
          <Dots done={t.done} total={tot} />
        </button>
      ) : (
        <button className={`chk${isDone ? " dn" : ""}`} onClick={() => onToggle(t.id)}>
          {isDone && "✓"}
        </button>
      )}
      <span className="inm">{t.name}</span>
      {t.subs.length > 0 && <span className="sub-pill">{subDone}/{t.subs.length}</span>}
      {hasTimer && !isDone && (
        <button className="timer-open-btn" onClick={() => onTimerOpen(t)}>⏱ Timer</button>
      )}
      {t.time && <span className="tbadge">{fmtT(t.time)}</span>}
      <button className="editbtn" onClick={() => onEdit(t)} title="Edit task"><img src={pencilIcon} alt="edit" style={{width:15, height:15, marginTop:4}} /></button>
      <button className="delbtn" onClick={() => onDelete(t.id)}>✕</button>
    </div>
  );
}

// ── Floating timer ───────────────────────────────────────────────────────────
function FloatingTimer({ timer, onPlay, onPause, onReset, onSkip, onMinimize, onClose }) {
  const [pos, setPos] = useState(null);
  const posRef = useRef(null);
  posRef.current = pos;
  const floatRef = useRef(null);
  const [remaining, setRemaining] = useState(0);
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!timer) return;
    firedRef.current = false;
    const calcRem = () =>
      Math.max(0, timer.dur - timer.elapsed -
        (timer.running && timer.startTs ? (Date.now() - timer.startTs) / 1000 : 0));
    setRemaining(calcRem());
    if (!timer.running) return;
    const id = setInterval(() => {
      const rem = calcRem();
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) { firedRef.current = true; onSkipRef.current(); }
    }, 200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.running, timer?.startTs, timer?.dur, timer?.elapsed, timer?.taskId]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const rect = floatRef.current?.getBoundingClientRect();
    const cur = posRef.current ?? (rect ? { x: rect.left, y: rect.top } : { x: window.innerWidth - 260, y: window.innerHeight - 380 });
    const sx = e.clientX, sy = e.clientY, px = cur.x, py = cur.y;
    const onMove = (ev) => { const np = { x: px + ev.clientX - sx, y: py + ev.clientY - sy }; posRef.current = np; setPos(np); };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    const rect = floatRef.current?.getBoundingClientRect();
    const cur = posRef.current ?? (rect ? { x: rect.left, y: rect.top } : { x: window.innerWidth - 260, y: window.innerHeight - 380 });
    const sx = t.clientX, sy = t.clientY, px = cur.x, py = cur.y;
    const onMove = (ev) => { const tc = ev.touches[0]; const np = { x: px + tc.clientX - sx, y: py + tc.clientY - sy }; posRef.current = np; setPos(np); };
    const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  if (!timer || !timer.visible) return null;

  const RING_R = 38;
  const CIRC = 2 * Math.PI * RING_R;
  const progress = timer.dur > 0 ? Math.max(0, Math.min(1, remaining / timer.dur)) : 0;
  const dashOffset = CIRC * (1 - progress);
  const urgent = remaining > 0 && remaining <= 30;

  if (timer.minimized) {
    const DR = 11, DC = 2 * Math.PI * DR;
    return (
      <div className="timer-dock">
        <div className="dock-inner">
          <div className="dock-ring-wrap">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <circle className="dock-ring-bg" cx="14" cy="14" r={DR} />
              <circle className="dock-ring-fill" cx="14" cy="14" r={DR}
                strokeDasharray={DC} strokeDashoffset={DC * (1 - progress)}
                style={{ stroke: urgent ? 'var(--terra)' : 'var(--sage)' }}
              />
            </svg>
          </div>
          <div className="dock-info">
            <span className="dock-name">{timer.taskName}</span>
            <span className={`dock-time${urgent ? " urgent" : ""}`}>{fmtSecs(remaining)}</span>
          </div>
          <button className="dock-play" onClick={timer.running ? onPause : onPlay}>
            {timer.running ? "⏸" : "▶"}
          </button>
          <button className="dock-expand-btn" onClick={onMinimize}>↗</button>
          <button className="delbtn" onClick={onClose}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={floatRef}
      className="float-timer"
      style={pos ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' } : {}}
    >
      <div className="ft-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
        <span className="ft-drag-dots">⠿</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {timer.taskName}
        </span>
        <button className="ft-hbtn" onClick={onMinimize} title="Minimize">⌄</button>
        <button className="ft-hbtn" onClick={onClose} title="Close (keeps running)">✕</button>
      </div>
      <div className="ft-body">
        <div className="ft-ring-wrap">
          <svg className="ft-ring" width="100" height="100" viewBox="0 0 100 100">
            <circle className="ft-ring-bg" cx="50" cy="50" r={RING_R} />
            <circle className="ft-ring-fill" cx="50" cy="50" r={RING_R}
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
              style={{ stroke: urgent ? 'var(--terra)' : 'var(--sage)' }}
            />
          </svg>
          <div className="ft-time-label">
            <span className={`ft-time${urgent ? " urgent" : ""}`}>{fmtSecs(remaining)}</span>
          </div>
        </div>
        <div className="ft-status">{timer.running ? "Running…" : remaining === 0 ? "Done!" : "Paused"}</div>
        <div className="ft-controls">
          <button className="ft-btn" onClick={onReset}>↺ Reset</button>
          <button className={`ft-btn primary${timer.running ? " running" : ""}`} onClick={timer.running ? onPause : onPlay}>
            {timer.running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button className="ft-btn" onClick={onSkip}>✓ Done</button>
        </div>
        <div className="ft-name-label">{timer.taskName}</div>
      </div>
    </div>
  );
}

// ── Month calendar ────────────────────────────────────────────────────────────
function MonthView({ cursor, today, selDate, cals, onSelectDate }) {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const startDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const trailing = (7 - (startDay + daysInMonth) % 7) % 7;
  const todayStr = fmt(today), selStr = fmt(selDate);

  const cells = [];
  for (let i = startDay - 1; i >= 0; i--)
    cells.push({ day: prevDays - i, current: false, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, current: true, dateStr });
  }
  for (let d = 1; d <= trailing; d++)
    cells.push({ day: d, current: false, dateStr: null });

  return (
    <div>
      <div className="mgh">
        {DAYS.map((d) => <div key={d} className="dhl">{d}</div>)}
      </div>
      <div className="mg">
        {cells.map((c, i) => {
          const items = c.dateStr ? cals.filter((ev) => ev.date === c.dateStr).slice(0, 2) : [];
          return (
            <div
              key={i}
              className={`mc${!c.current ? " om" : ""}${c.dateStr === todayStr ? " td" : ""}${c.dateStr === selStr ? " sel" : ""}`}
              onClick={() => c.dateStr && onSelectDate(c.dateStr)}
            >
              <div className="cn">{c.day}</div>
              <div className="cds">
                {items.map((ev) => (
                  <div key={ev.id} className={`cd ${ev.type}`}>{ev.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week calendar ─────────────────────────────────────────────────────────────
function WeekView({ cursor, today, cals, timedItems, onSelectDate }) {
  const ws = new Date(cursor);
  ws.setDate(ws.getDate() - ws.getDay());
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d;
  });
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div>
      {/* Header */}
      <div className="wh" style={{ gridTemplateColumns: "48px repeat(7,1fr)" }}>
        <div className="tcol" />
        {cols.map((d, i) => (
          <div key={i} className="wdh">
            <div className="wdn">{DAYS[d.getDay()]}</div>
            <div className={`wdd${fmt(d) === fmt(today) ? " tdot" : ""}`}>{d.getDate()}</div>
          </div>
        ))}
      </div>
      {/* Routines & tasks band */}
      {timedItems.length > 0 && (
        <div className="band-wrap" style={{ gridTemplateColumns: "48px repeat(7,1fr)" }}>
          <div className="blc"><span className="bll">ROUTINES<br />&amp; TASKS</span></div>
          {cols.map((_, i) => (
            <div key={i} className="bc">
              {timedItems.map((it, j) => (
                <div key={j} className="bp" style={{ background: it.tp === "r" ? "var(--terra-light)" : "var(--sage-pale)", color: it.tp === "r" ? "var(--terra)" : "var(--sage)" }}>
                  {fmtT(it.time)} {it.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {/* Time grid */}
      <div className="wg" style={{ gridTemplateColumns: "48px repeat(7,1fr)" }}>
        <div className="tcol">
          {hours.map((h) => <div key={h} className="ts">{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</div>)}
        </div>
        {cols.map((d, i) => {
          const ds = fmt(d);
          const items = cals.filter((ev) => ev.date === ds);
          return (
            <div key={i} className="wc" onClick={() => onSelectDate(ds)}>
              {hours.map((h) => <div key={h} className="ws" />)}
              {items.map((ev) => {
                if (!ev.time) return null;
                const [hh, mm] = ev.time.split(":").map(Number);
                return (
                  <div key={ev.id} className={`we ${ev.type}`} style={{ top: hh * 48 + mm * 0.8, height: 40 }}>
                    {ev.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day calendar ──────────────────────────────────────────────────────────────
function BlockModal({ block, defaultTime, onClose, onSave }) {
  const [label, setLabel] = useState(block?.label || '');
  const [startTime, setStartTime] = useState(block?.time || defaultTime || '09:00');
  const [dur, setDur] = useState(block?.dur || 60);
  const [kind, setKind] = useState(block?.kind || 'task');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal routine" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{block ? 'Edit block' : 'New time block'}</div>
        <div className="modal-sub">A block of time in your day</div>
        <div className="field"><label>BLOCK NAME</label>
          <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSave({ label, time: startTime, dur, kind })}
            placeholder="e.g. Morning routine, Deep work…" />
        </div>
        <div className="field-row">
          <div className="field"><label>TYPE</label>
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="task">Task</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div className="field"><label>START TIME</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="field"><label>DURATION</label>
            <select value={dur} onChange={e => setDur(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={() => onSave({ label, time: startTime, dur, kind })}>Save block →</button>
        </div>
      </div>
    </div>
  );
}

function DayView({ cursor, cals, timedItems, blocks, onAddBlock, onEditBlock, onDeleteBlock, onLinkItem, todos }) {
  const ds = fmt(cursor);
  const timedCals = cals.filter((ev) => ev.date === ds && ev.time);
  const untimedTodos = todos.filter((t) => {
    const isDone = (t.tot || 1) > 1 ? t.done >= t.tot : t.done;
    return !isDone && !t.time;
  });
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const SLOT = 48;
  const minsToTop = (mins) => ((mins - 6 * 60) / 60) * SLOT;

  const handleGridClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMins = Math.round(((y / SLOT) * 60 + 6 * 60) / 15) * 15;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    onAddBlock(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <div>
      <div className="dhr3">
        <div className="dhr3-left">ROUTINES &amp; TASKS</div>
        <div className="dhr3-mid" />
        <div className="dhr3-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
          <span>CALENDAR EVENTS</span>
          <button className="add-block-btn" onClick={() => onAddBlock(null)}>＋ Add block</button>
        </div>
      </div>
      <div className="dv3">
        <div className="dleft">
          {hours.map((h) => <div key={h} className="dsl" />)}
          {timedItems.map((it, i) => {
            const [hh, mm] = it.time.split(":").map(Number);
            return (
              <div key={i} className="de-rt" style={{
                top: hh * 48 + mm * 0.8,
                background: it.tp === "r" ? "var(--terra-light)" : "var(--sage-pale)",
                color: it.tp === "r" ? "var(--terra)" : "var(--sage)"
              }}>
                {fmtT(it.time)} {it.name}
              </div>
            );
          })}
        </div>
        <div className="d3tcol">
          {hours.map((h) => <div key={h} className="ts">{h === 0 ? "" : fmtT(`${String(h).padStart(2, '0')}:00`)}</div>)}
        </div>
        <div className="dright" onClick={handleGridClick} style={{ position: 'relative' }}>
          {hours.map((h) => <div key={h} className="dsl" />)}
          {timedCals.map((ev) => {
            const [hh, mm] = ev.time.split(":").map(Number);
            return (
              <div key={ev.id} className={`de ${ev.type}`} style={{ top: hh * 48 + mm * 0.8, height: 44 }}>
                <strong>{ev.title}</strong><br />
                <span style={{ fontSize: 10 }}>{fmtT(ev.time)}{ev.endTime ? ` – ${fmtT(ev.endTime)}` : ''}</span>
              </div>
            );
          })}
          {blocks.map((b) => {
            const [bh, bm] = b.time.split(':').map(Number);
            const top = minsToTop(bh * 60 + bm);
            const height = (b.dur / 60) * SLOT;
            const endMins = bh * 60 + bm + b.dur;
            const eh = Math.floor(endMins / 60), em = endMins % 60;
            const linkedItems = [...(todos || []), ...(cals || [])].filter(i => (b.linked || []).includes(String(i.id)));
            const available = [
              ...(todos || []).map(t => ({ ...t, kind: 'task' })),
              ...(cals.filter(e => e.date === ds)).map(e => ({ ...e, kind: 'event' }))
            ].filter(i => !(b.linked || []).includes(String(i.id)));
            return (
              <div key={b.id} className="time-block" style={{ top, height: Math.max(height, 48) }}
                onClick={e => e.stopPropagation()}>
                <div className="tb-header">
                  <span className="tb-label">{b.label}</span>
                  <span className="tb-time">{fmtT(b.time)}–{fmtT(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`)}</span>
                  <button className="editbtn" onClick={() => onEditBlock(b)}>✏️</button>
                  <button className="delbtn" onClick={() => onDeleteBlock(b.id)}>✕</button>
                </div>
                {linkedItems.length > 0 && (
                  <div className="tb-items">
                    {linkedItems.map(i => (
                      <div key={i.id} className="tb-item">
                        <span>{i.type === 'event' ? '📅' : '📝'}</span> {i.name || i.title}
                      </div>
                    ))}
                  </div>
                )}
                <div className="tb-link" onClick={e => e.stopPropagation()}>
                  <select defaultValue="" onChange={e => { if (e.target.value) { onLinkItem(b.id, e.target.value); e.target.value = ''; } }}>
                    <option value="">Link an item…</option>
                    {available.map(i => <option key={i.id} value={String(i.id)}>{i.kind === 'event' ? '📅' : '📝'} {i.name || i.title}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {untimedTodos.length > 0 && (
        <div className="day-untimed">
          <div className="day-untimed-label">TASKS — NO TIME SET</div>
          {untimedTodos.map((t) => (
            <div key={t.id} className="day-untimed-item">
              <span className="day-untimed-dot" />
              {t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Calendar icon ─────────────────────────────────────────────────────────────
function CalendarIcon({ size = 36 }) {
  const today = new Date();
  const month = today.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = today.getDate();
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'white',
        borderRadius: 4,
        margin: '18% 8% 8% 8%'
      }} />
      <img src={calendarIcon} alt="calendar" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, textAlign: 'center', fontSize: size * 0.22, fontWeight: 700, color: '#fff', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
        {month}
      </div>
      <div style={{ position: 'absolute', top: '44%', left: 0, right: 0, textAlign: 'center', fontSize: size * 0.32, fontWeight: 700, color: '#1a1a1a', fontFamily: 'DM Serif Display, serif', lineHeight: 1 }}>
        {day}
      </div>
    </div>
  );
}

// ── Journal page ──────────────────────────────────────────────────────────────
function JournalPage({ journals, setJournals, today }) {
  const [date, setDate] = useState(fmt(today));
  const [text, setText] = useState(journals[fmt(today)]?.text || "");

  const handleDateChange = (newDate) => {
    setDate(newDate);
    setText(journals[newDate]?.text || "");
  };

  const handleSave = async () => {
    const entry = { date, text, updated_at: new Date().toISOString() };
    setJournals(prev => ({ ...prev, [date]: entry }));
    await supabase.from('journals').upsert(entry, { onConflict: 'date' });
  };

  const displayDate = new Date(date + "T12:00:00");
  const dateLabel = displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="journal-page">
      <div className="journal-card">
        <div className="journal-header">
          <div className="journal-header-left">
            <div className="journal-date-label">{dateLabel}</div>
            <input type="date" className="journal-date-input" value={date} onChange={(e) => handleDateChange(e.target.value)} />
          </div>
        </div>
        <div className="journal-divider" />
        <textarea
          className="journal-textarea"
          value={text}
          onChange={(e) => { setText(e.target.value); }}
          onBlur={handleSave}
          placeholder="What's on your mind today…"
        />
        <div className="journal-footer">
          <span className="journal-word-count">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
          <button className="journal-save-btn" onClick={handleSave}>Save entry ✓</button>
        </div>
      </div>
      <div className="journal-past">
        <div className="journal-past-title">Past entries</div>
        {Object.entries(journals).sort((a,b) => b[0].localeCompare(a[0])).map(([d, entry]) => {
          const dl = new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return (
            <div key={d} className={`journal-past-item${d === date ? " active" : ""}`} onClick={() => handleDateChange(d)}>
              <div className="journal-past-date">{dl}</div>
              <div className="journal-past-preview">{entry.text.slice(0, 60)}{entry.text.length > 60 ? "…" : ""}</div>
            </div>
          );
        })}
        {Object.keys(journals).length === 0 && <div className="journal-past-empty">No past entries yet</div>}
      </div>
    </div>
  );
}

// ── Finance page ──────────────────────────────────────────────────────────────
function Spreadsheet({ title }) {
  const [headers, setHeaders] = useState(['Date', 'Item', 'Amount']);
  const [rows, setRows] = useState([['', '', '']]);

  const updateHeader = (i, val) => setHeaders(prev => prev.map((h, j) => j === i ? val : h));
  const updateCell = (row, col, val) => setRows(prev => prev.map((r, i) => i === row ? r.map((c, j) => j === col ? val : c) : r));
  const addRow = () => setRows(prev => [...prev, ['', '', '']]);
  const removeRow = () => setRows(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  const total = rows.reduce((sum, r) => { const n = parseFloat(r[2]); return sum + (isNaN(n) ? 0 : n); }, 0);

  return (
    <div className="finance-card">
      <div className="finance-card-header">
        <span className="finance-card-title">{title}</span>
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th className="finance-row-num" />
              {headers.map((h, i) => (
                <th key={i}>
                  <input className="finance-header-input" value={h} onChange={e => updateHeader(i, e.target.value)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="finance-row-num">{rowIdx + 1}</td>
                {row.map((cell, colIdx) => (
                  <td key={colIdx}>
                    {colIdx === 0 ? (
                      <input type="date" className="finance-cell-input finance-date-input" value={cell} onChange={e => updateCell(rowIdx, colIdx, e.target.value)} />
                    ) : colIdx === 2 ? (
                      <div className="finance-cost-cell">
                        <span className="finance-dollar">$</span>
                        <input className="finance-cell-input" value={cell} onChange={e => updateCell(rowIdx, colIdx, e.target.value.replace(/[^0-9.]/g, ''))} />
                      </div>
                    ) : (
                      <input className="finance-cell-input" value={cell} onChange={e => updateCell(rowIdx, colIdx, e.target.value)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="finance-total-row">
              <td className="finance-row-num" />
              <td className="finance-total-label">Total</td>
              <td className="finance-total-value">${total % 1 === 0 ? total : total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="finance-row-btns">
        <button className="finance-add-row" onClick={addRow}>+ Add Row</button>
        <button className="finance-remove-row" onClick={removeRow}>− Delete Row</button>
      </div>
    </div>
  );
}

function FinancePage() {
  return (
    <div className="finance-page">
      <Spreadsheet title="Income" />
      <Spreadsheet title="Expenses" />
    </div>
  );
}

// ── Hamburger menu ────────────────────────────────────────────────────────────
function HamburgerMenu({ page, setPage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const items = [
    { id: 'calendar', icon: <CalendarIcon size={22} />, label: 'Calendar' },
    { id: 'tasks',    icon: '✅', label: 'Tasks' },
    { id: 'journal',  icon: <img src={journalIcon} alt="journal" style={{width:30,height:30,objectFit:'contain',mixBlendMode:'multiply',marginTop:5}} />, label: 'Journal' },
    { id: 'finance',  icon: '💰', label: 'Finance' },
  ];
  return (
    <div className="ham-wrap" ref={ref}>
      <button className={`hamburger${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-label="Navigation">
        <span className="hbar" /><span className="hbar" /><span className="hbar" />
      </button>
      {open && (
        <div className="ham-dropdown">
          {items.map((item, i) => (
            <>
              {i === 3 && <div className="ham-divider" key="div" />}
              <button key={item.id} className={`ham-item${page === item.id ? ' active' : ''}`}
                onClick={() => { setPage(item.id); setOpen(false); }}>
                <span className="ham-icon">{item.icon}</span>
                {item.label}
                {page === item.id && <span className="ham-dot" />}
              </button>
            </>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [page, setPage] = useState("calendar"); // "calendar" | "tasks" | "journal"
  const [journals, setJournals] = useState({});
  const [notifPermission, setNotifPermission] = useState(('Notification' in window ? Notification.permission : 'denied'));
  const notifIds = useRef({});

  useEffect(() => {
    setupFCM().then(() => {
      if ('Notification' in window) setNotifPermission(Notification.permission);
    });
    // eslint-disable-next-line
  }, []);

  // ── Load from Supabase on mount ───────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [{ data: todosData }, { data: calsData }, { data: journalsData }] = await Promise.all([
        supabase.from('todos').select('*').order('created_at'),
        supabase.from('cals').select('*').order('created_at'),
        supabase.from('journals').select('*').order('date', { ascending: false }),
      ]);
      if (todosData) setTodos(todosData.map(t => ({ ...t, timerDur: t.timer_dur || 0, timerActive: false, timerStart: null, timerElapsed: 0, subs: t.subs || [] })));
      if (calsData) setCals(calsData.map(ev => ({ ...ev, endTime: ev.end_time || null })));
      if (journalsData) {
        const j = {};
        journalsData.forEach(e => { j[e.date] = e; });
        setJournals(j);
      }
    };
    load();
  }, []);

  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date(today));
  const [modal, setModal] = useState(null); // "todo" | "event" | null
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addBtnRef = useRef(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [blockModal, setBlockModal] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);
  const activeTimerRef = useRef(null);
  activeTimerRef.current = activeTimer;

  const [cals, setCals] = useState([
    { id: 1, title: "Team standup", type: "event", date: fmt(today), time: "09:00" },
    { id: 2, title: "Dentist appt", type: "event", date: fmtOff(today, 2), time: "10:30" },
  ]);
  const [todos, setTodos] = useState([
    { id: 10, name: "Brush teeth", tot: 2, done: 0, time: null, subs: [{ id: 101, name: "Use mouthwash", done: false }], timerDur: 0, timerActive: false, timerStart: null, timerElapsed: 0 },
    { id: 11, name: "Morning walk", tot: 1, done: 0, time: "07:00", subs: [], timerDur: 0, timerActive: false, timerStart: null, timerElapsed: 0 },
    { id: 12, name: "Read 20 mins", tot: 1, done: 0, time: "21:00", subs: [], timerDur: 1200, timerActive: false, timerStart: null, timerElapsed: 0 },
    { id: 20, name: "Review project brief", tot: 1, done: 0, time: null, subs: [], timerDur: 0, timerActive: false, timerStart: null, timerElapsed: 0 },
    { id: 21, name: "Reply to emails", tot: 1, done: 0, time: "10:00", subs: [{ id: 201, name: "Reply to Sarah", done: false }], timerDur: 0, timerActive: false, timerStart: null, timerElapsed: 0 },
  ]);

  // eslint-disable-next-line
  useEffect(() => {
    if (notifPermission !== 'granted') return;
    Object.values(notifIds.current).forEach(cancelNotification);
    notifIds.current = {};
    cals.forEach(ev => {
      if (!ev.date || !ev.time || !ev.reminder) return;
      const eventTime = new Date(ev.date + 'T' + ev.time);
      const fireAt = eventTime.getTime() - ev.reminder * 60 * 1000;
      const id = scheduleNotification(
        `📅 ${ev.title}`,
        `Starting in ${ev.reminder} minute${ev.reminder !== 1 ? 's' : ''}`,
        fireAt
      );
      if (id) notifIds.current[ev.id] = id;
    });
  }, [cals, notifPermission]); // eslint-disable-line

  // ── Nav ───────────────────────────────────────────────────────────────────
  const nav = (dir) => {
    setCursor((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const periodLabel = (() => {
    if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "week") {
      const ws = new Date(cursor); ws.setDate(ws.getDate() - ws.getDay());
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      return `${MONTHS_SHORT[ws.getMonth()]} ${ws.getDate()} – ${MONTHS_SHORT[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`;
    }
    return `${DAYS[cursor.getDay()]}, ${MONTHS[cursor.getMonth()]} ${cursor.getDate()}`;
  })();

  // ── Timed items (routines + todos with times) ─────────────────────────────
  const timedItems = todos
    .filter((t) => t.time && !((t.tot || 1) > 1 ? t.done >= t.tot : t.done))
    .map((t) => ({ name: t.name, time: t.time, tp: (t.tot || 1) > 1 ? "r" : "t" }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // ── Save handlers ─────────────────────────────────────────────────────────
  const handleSave = async (type, data) => {
    if (type === "todo") {
      if (editingTodo) {
        const updated = { name: data.name, time: data.time, tot: data.rep, timer_dur: data.timerDur || 0, subs: data.subs };
        setTodos((prev) => prev.map((t) => t.id === editingTodo.id
          ? { ...t, ...updated, timerDur: updated.timer_dur, timerActive: false, timerStart: null, timerElapsed: 0 }
          : t
        ));
        setEditingTodo(null);
        await supabase.from('todos').update(updated).eq('id', editingTodo.id);
      } else {
        const newTodo = { id: uid(), name: data.name, tot: data.rep || 1, done: 0, time: data.time, timer_dur: data.timerDur || 0, subs: data.subs || [], created_at: new Date().toISOString() };
        setTodos((prev) => [...prev, { ...newTodo, timerDur: newTodo.timer_dur, timerActive: false, timerStart: null, timerElapsed: 0 }]);
        await supabase.from('todos').insert(newTodo);
      }
    } else if (type === "event") {
      if (editingEvent) {
        const updated = { title: data.name, time: data.time || "09:00", end_time: data.endTime || null, date: data.date, reminder: data.reminder || 0 };
        setCals((prev) => prev.map((ev) => ev.id === editingEvent.id ? { ...ev, ...updated, endTime: updated.end_time } : ev));
        setEditingEvent(null);
        await supabase.from('cals').update(updated).eq('id', editingEvent.id);
      } else {
        const newCal = { id: uid(), title: data.name, type: "event", date: data.date, time: data.time || "09:00", end_time: data.endTime || null, reminder: data.reminder || 0, created_at: new Date().toISOString() };
        setCals((prev) => [...prev, { ...newCal, endTime: newCal.end_time }]);
        await supabase.from('cals').insert(newCal);
      }
    }
  };

  const openEditEvent = (ev) => {
    setEditingEvent(ev);
    setModal("event");
  };
  const delCal = async (id) => {
    setCals((prev) => prev.filter((ev) => ev.id !== id));
    await supabase.from('cals').delete().eq('id', id);
  };

  const openEditTodo = (t) => { setEditingTodo(t); setModal("todo"); };

  const openTimer = useCallback((item, taskType) => {
    setActiveTimer((prev) => {
      if (prev && prev.taskId === item.id) return { ...prev, visible: true, minimized: false };
      return { taskId: item.id, taskType, taskName: item.name, dur: item.timerDur, elapsed: 0, running: false, startTs: null, visible: true, minimized: false };
    });
  }, []);
  const timerPlay = useCallback(() => setActiveTimer((prev) => prev ? { ...prev, running: true, startTs: Date.now() } : prev), []);
  const timerPause = useCallback(() => setActiveTimer((prev) => prev ? { ...prev, running: false, elapsed: prev.elapsed + (prev.startTs ? (Date.now() - prev.startTs) / 1000 : 0), startTs: null } : prev), []);
  const timerReset = useCallback(() => setActiveTimer((prev) => prev ? { ...prev, running: false, elapsed: 0, startTs: null } : prev), []);
  const timerSkip = useCallback(() => {
    const prev = activeTimerRef.current;
    if (!prev) return;
    setTodos((ts) => ts.map((t) => {
      if (t.id !== prev.taskId) return t;
      if ((t.tot || 1) > 1) return { ...t, done: Math.min(t.done + 1, t.tot) };
      return { ...t, done: 1 };
    }));
    setActiveTimer(null);
  }, []);
  const timerMinimize = useCallback(() => setActiveTimer((prev) => prev ? { ...prev, minimized: !prev.minimized, visible: true } : prev), []);
  const timerClose = useCallback(() => setActiveTimer((prev) => prev ? { ...prev, visible: false } : prev), []);

  // ── Todo actions ──────────────────────────────────────────────────────────
  const togT = async (id) => {
    setTodos((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const updated = (t.tot || 1) > 1
        ? { ...t, done: (t.done + 1) % ((t.tot || 1) + 1) }
        : { ...t, done: t.done ? 0 : 1 };
      supabase.from('todos').update({ done: updated.done }).eq('id', id);
      return updated;
    }));
  };
  const delT = async (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await supabase.from('todos').delete().eq('id', id);
  };

  // ── Block handlers ────────────────────────────────────────────────────────
  const handleAddBlock = (time) => { setEditingBlock(null); setBlockModal(time || '09:00'); };
  const handleEditBlock = (block) => { setEditingBlock(block); setBlockModal(block.time); };
  const handleSaveBlock = (data) => {
    if (editingBlock) {
      setBlocks(prev => prev.map(b => b.id === editingBlock.id ? { ...b, ...data } : b));
    } else {
      setBlocks(prev => [...prev, { id: uid(), ...data, linked: [] }]);
    }
    setBlockModal(null); setEditingBlock(null);
  };
  const handleDeleteBlock = (id) => setBlocks(prev => prev.filter(b => b.id !== id));
  const handleLinkItem = (blockId, itemId) => setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, linked: [...(b.linked || []), itemId] } : b));

  // ── Today's schedule ──────────────────────────────────────────────────────
  const todayEvents = cals.filter((ev) => ev.date === fmt(today)).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="app">
      {/* Modal */}
      {blockModal && (
        <BlockModal
          block={editingBlock}
          defaultTime={blockModal}
          onClose={() => { setBlockModal(null); setEditingBlock(null); }}
          onSave={handleSaveBlock}
        />
      )}
      {modal && (
        <Modal
          type={modal}
          today={today}
          onClose={() => { setModal(null); setEditingEvent(null); setEditingTodo(null); }}
          onSave={(data) => handleSave(modal, data)}
          editData={
            modal === "event" && editingEvent
              ? { name: editingEvent.title, time: editingEvent.time || "", endTime: editingEvent.endTime || editingEvent.end_time || "", date: editingEvent.date, reminder: editingEvent.reminder || 0 }
              : modal === "todo" && editingTodo
              ? { name: editingTodo.name, time: editingTodo.time || "", rep: editingTodo.tot || 1, timerDur: editingTodo.timerDur || 0, subs: editingTodo.subs }
              : null
          }
        />
      )}

      <div className="wrap">
        {/* Header */}
        <header className="header">
          <HamburgerMenu page={page} setPage={setPage} />
          <div className="header-left">
            <div className="app-name">My Planner</div>
            <div className="app-date">
              {DAY_NAMES[today.getDay()]}, {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
            </div>
          </div>
          <div className="header-center">
            <button ref={addBtnRef} className="add-plus-btn" onClick={() => setShowAddMenu(m => !m)}>+</button>
            {showAddMenu && (() => {
              const rect = addBtnRef.current?.getBoundingClientRect();
              const top = rect ? rect.bottom + 8 : 70;
              const rawLeft = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
              const left = Math.min(Math.max(rawLeft, 80), window.innerWidth - 80);
              return (
                <>
                  <div className="add-menu-backdrop" onClick={() => setShowAddMenu(false)} />
                  <div className="add-menu" style={{position:"fixed", top, left, transform:"translateX(-50%)"}}>
                    <button className="add-menu-item" onClick={() => { setModal("todo"); setShowAddMenu(false); }}>
                      <span>✅</span> Task
                    </button>
                    <button className="add-menu-item" onClick={() => { setModal("event"); setShowAddMenu(false); }}>
                      <span style={{position:"relative",display:"inline-flex",verticalAlign:"middle",width:15,height:15,flexShrink:0}}>
                        <img src={calendarIcon} alt="calendar" style={{width:15,height:15,mixBlendMode:"multiply"}} />
                        <span style={{position:"absolute",top:1,left:1,right:0,textAlign:"left",fontSize:3,fontWeight:800,color:"#fff",letterSpacing:"0.04em",lineHeight:1,pointerEvents:"none"}}>JAN</span>
                        <span style={{position:"absolute",top:6,left:0,right:0,textAlign:"center",fontSize:5,fontWeight:700,color:"var(--ink)",lineHeight:1,pointerEvents:"none"}}>1</span>
                      </span> Event
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </header>

        {notifPermission === 'default' && (
          <div className="notif-banner">
            <span>Enable notifications for event reminders</span>
            <button onClick={() => setupFCM().then(() => { if ('Notification' in window) setNotifPermission(Notification.permission); })}>
              Enable →
            </button>
          </div>
        )}

        {/* Calendar page */}
        {page === "calendar" && (
          <div className="main">
            <div className="cal-card">
              <div className="cal-nav">
                <div className="nav-btns">
                  <button className="nav-btn" onClick={() => nav(-1)}>‹</button>
                  <span className="period-label">{periodLabel}</span>
                  <button className="nav-btn" onClick={() => nav(1)}>›</button>
                </div>
                <div className="view-btns">
                  {["month", "week", "day"].map((v) => (
                    <button key={v} className={`view-btn${view === v ? " active" : ""}`} onClick={() => setView(v)}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {view === "month" && (
                <MonthView cursor={cursor} today={today} selDate={cursor} cals={cals} onSelectDate={(ds) => setCursor(new Date(ds + "T12:00:00"))} />
              )}
              {view === "week" && (
                <WeekView cursor={cursor} today={today} cals={cals} timedItems={timedItems} onSelectDate={(ds) => setCursor(new Date(ds + "T12:00:00"))} />
              )}
              {view === "day" && (
                <DayView cursor={cursor} cals={cals} timedItems={timedItems} todos={todos}
                  blocks={blocks}
                  onAddBlock={handleAddBlock}
                  onEditBlock={handleEditBlock}
                  onDeleteBlock={handleDeleteBlock}
                  onLinkItem={handleLinkItem}
                />
              )}
            </div>

            <div className="sidebar">
              <div className="sc">
                <div className="st">
                  ☀️ Today's schedule
                  <span className="ssub">{MONTHS_SHORT[today.getMonth()]} {today.getDate()}</span>
                </div>
                <div className="il" style={{ maxHeight: 200 }}>
                  {todayEvents.length === 0 ? (
                    <div className="en">Nothing scheduled — enjoy a free day ✨</div>
                  ) : todayEvents.map((ev) => {
                    const [hh, mm] = ev.time.split(":").map(Number);
                    const ap = hh >= 12 ? "pm" : "am";
                    const h12 = hh % 12 || 12;
                    return (
                      <div key={ev.id} className="schit">
                        <span style={{ fontSize: 13 }}>📅</span>
                        <span className="schit-name">{ev.title}</span>
                        <span className="schit-time">{h12}:{String(mm).padStart(2, "0")}{ap}{ev.endTime ? ` – ${ev.endTime}` : ''}</span>
                        <button className="editbtn" onClick={() => openEditEvent(ev)} title="Edit event"><img src={pencilIcon} alt="edit" style={{width:15, height:15, marginTop:4}} /></button>
                        <button className="delbtn" onClick={() => delCal(ev.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tasks page */}
        {page === "journal" && (
          <JournalPage journals={journals} setJournals={setJournals} today={today} />
        )}

        {page === "finance" && <FinancePage />}

        {page === "tasks" && (
          <div className="tasks-page">
            <div className="sc sc-ruled" style={{ gridColumn: "1 / -1" }}>
              <div className="st">✅ Tasks</div>
              <div className="il">
                {todos.length === 0 ? (
                  <div className="en">Nothing to do — enjoy the quiet ✨</div>
                ) : todos.map((t) => (
                  <TodoItem key={t.id} t={t} onToggle={togT} onDelete={delT} onEdit={openEditTodo} onTimerOpen={(item) => openTimer(item, 't')} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <FloatingTimer
        timer={activeTimer}
        onPlay={timerPlay}
        onPause={timerPause}
        onReset={timerReset}
        onSkip={timerSkip}
        onMinimize={timerMinimize}
        onClose={timerClose}
      />
    </div>
  );
}
