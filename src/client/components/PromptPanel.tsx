import { useEffect, useState } from 'react';
import type { Prompt } from '../../engine/types';
import { send } from '../net';
import { sideName, useMatchCtx } from '../lib';

export function PromptPanel({ prompt, onBehalf, keyboard = true }: { prompt: Prompt; onBehalf?: boolean; keyboard?: boolean }) {
  const { update } = useMatchCtx();
  const [busy, setBusy] = useState(false);
  const submit = async (value: unknown) => {
    setBusy(true);
    await send({ type: 'answer', promptId: prompt.id, value });
    setBusy(false);
  };
  return (
    <div className="prompt">
      {onBehalf && <div className="tag">Answering for {sideName(update, prompt.seat)}</div>}
      <div className="prompt-title">{prompt.title}</div>
      {prompt.detail && <div className="prompt-detail">{prompt.detail}</div>}
      {prompt.kind === 'choice' && <ChoiceInput prompt={prompt} busy={busy} onSubmit={submit} />}
      {prompt.kind === 'number' && <NumberInput prompt={prompt} busy={busy} onSubmit={submit} />}
      {prompt.kind === 'dice' && <DiceInput prompt={prompt} busy={busy} onSubmit={submit} keyboard={keyboard} />}
      {prompt.kind === 'objectives' && <ObjectivesInput prompt={prompt} busy={busy} onSubmit={submit} />}
    </div>
  );
}

interface InputProps {
  prompt: Prompt;
  busy: boolean;
  onSubmit: (v: unknown) => void;
}

function ChoiceInput({ prompt, busy, onSubmit }: InputProps) {
  return (
    <div className="choice-list">
      {prompt.options?.map((o) => (
        <button key={o.value} className="btn choice" disabled={busy || o.disabled} title={o.note} onClick={() => onSubmit(o.value)}>
          {o.label}
          {o.disabled && o.note && <span className="muted small"> — {o.note}</span>}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ prompt, busy, onSubmit }: InputProps) {
  const [text, setText] = useState('');
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(n) && (prompt.min === undefined || n >= prompt.min) && (prompt.max === undefined || n <= prompt.max);
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(n);
      }}
    >
      <input
        className="input big-input"
        type="number"
        inputMode="decimal"
        step="0.25"
        min={prompt.min}
        max={prompt.max}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="0"
      />
      <span className="muted">{prompt.unit}</span>
      <button className="btn primary" disabled={!valid || busy}>
        Confirm
      </button>
    </form>
  );
}

function DiceInput({ prompt, busy, onSubmit, keyboard }: InputProps & { keyboard: boolean }) {
  const count = prompt.count ?? 1;
  const [dice, setDice] = useState<number[]>([]);
  useEffect(() => setDice([]), [prompt.id]);
  const add = (d: number) => setDice((x) => (x.length < count ? [...x, d] : x));
  const successes = prompt.target ? dice.filter((d) => d >= prompt.target!).length : null;

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^[1-6]$/.test(e.key)) add(Number(e.key));
      else if (e.key === 'Backspace') setDice((x) => x.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="dice-input">
      <div className="dice-slots">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`die ${dice[i] === undefined ? 'empty' : prompt.target && dice[i] >= prompt.target ? 'hit' : 'miss'}`}>
            {dice[i] ?? ''}
          </div>
        ))}
      </div>
      <div className="muted small">
        Roll {count}d6 and tap each result (or type 1–6 on a keyboard).
        {successes !== null && dice.length > 0 && ` ${successes} success${successes === 1 ? '' : 'es'} so far (${prompt.target}+).`}
      </div>
      <div className="dice-pad">
        {[1, 2, 3, 4, 5, 6].map((d) => (
          <button key={d} className="btn die-btn" disabled={busy || dice.length >= count} onClick={() => add(d)}>
            {d}
          </button>
        ))}
        <button className="btn" disabled={!dice.length} onClick={() => setDice((x) => x.slice(0, -1))}>
          ⌫
        </button>
      </div>
      <button className="btn primary wide" disabled={busy || dice.length !== count} onClick={() => onSubmit(dice)}>
        Submit dice
      </button>
    </div>
  );
}

function ObjectivesInput({ prompt, busy, onSubmit }: InputProps) {
  const n = prompt.objectives ?? 0;
  const [sel, setSel] = useState<Record<string, number>>(() => Object.fromEntries((prompt.suits ?? []).map((s) => [s.id, 0])));
  return (
    <div className="objectives-input">
      {(prompt.suits ?? []).map((s) => (
        <div key={s.id} className="obj-row">
          <span className="obj-label">{s.label}</span>
          <div className="segmented">
            {Array.from({ length: n + 1 }, (_, i) => (
              <button key={i} className={`seg ${sel[s.id] === i ? 'on' : ''}`} onClick={() => setSel({ ...sel, [s.id]: i })}>
                {i === 0 ? 'None' : `#${i}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn primary wide" disabled={busy} onClick={() => onSubmit(sel)}>
        Submit objective report
      </button>
    </div>
  );
}
