import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeBoardQuest, quests, type BoardQuest, type QuestKind, type QuestTemplate } from '../game';
import { QuestCard, type QuestCardActions } from './QuestCard';

const DAY = 20000;

function templateOfKind(kind: QuestKind): QuestTemplate {
  const t = quests.find((q) => q.kind === kind && q.minRing === 1);
  if (!t) throw new Error(`no ${kind} template`);
  return t;
}

function actions(): QuestCardActions {
  return {
    onComplete: vi.fn(),
    onTried: vi.fn(),
    onUndo: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onIncrement: vi.fn(),
    onReroll: vi.fn(),
  };
}

function renderCard(quest: BoardQuest, template: QuestTemplate, a: QuestCardActions, extra: Partial<{ canUndo: boolean; bonus: boolean; now: number; rerollAvailable: boolean }> = {}) {
  return render(
    <QuestCard
      quest={quest}
      template={template}
      bonus={extra.bonus ?? false}
      preview={{ xp: 20, coins: 10, dp: 1, loyalty: 6 }}
      now={extra.now ?? Date.now()}
      canUndo={extra.canUndo ?? true}
      rerollAvailable={extra.rerollAvailable ?? true}
      rerollPrice={15}
      {...a}
    />,
  );
}

describe('QuestCard', () => {
  it('check quest: Done completes, I tried marks, Swap rerolls', () => {
    const t = templateOfKind('check');
    const q = makeBoardQuest(DAY, t);
    const a = actions();
    renderCard(q, t, a);
    expect(screen.getByRole('heading', { name: t.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(a.onComplete).toHaveBeenCalledWith(q.instanceId);
    fireEvent.click(screen.getByRole('button', { name: /i tried/i }));
    expect(a.onTried).toHaveBeenCalledWith(q.instanceId);
    fireEvent.click(screen.getByRole('button', { name: /swap quest \(15\)/i }));
    expect(a.onReroll).toHaveBeenCalledWith(q.instanceId);
  });

  it('shows the bonus badge and the reward preview', () => {
    const t = templateOfKind('check');
    renderCard(makeBoardQuest(DAY, t), t, actions(), { bonus: true });
    expect(screen.getByText(/bonus x2/i)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /rewards/i })).toHaveTextContent('+20');
  });

  it('timer quest: live elapsed from startedAt, Stop pauses, Start starts', () => {
    const t = templateOfKind('timer');
    const now = Date.now();
    const running: BoardQuest = { ...makeBoardQuest(DAY, t), timer: { startedAt: now - 65_000, accumulatedMs: 0 } };
    const a = actions();
    const { unmount } = renderCard(running, t, a, { now });
    expect(screen.getByLabelText('Elapsed')).toHaveTextContent('01:05');
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(a.onPause).toHaveBeenCalledWith(running.instanceId);
    unmount();

    const idle = makeBoardQuest(DAY, t);
    renderCard(idle, t, a, { now });
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    expect(a.onStart).toHaveBeenCalledWith(idle.instanceId);
    expect(screen.getByText(/for \+10% xp/i)).toBeInTheDocument();
  });

  it('timer quest: reports the timed bonus once the full duration has run', () => {
    const t = templateOfKind('timer');
    const q: BoardQuest = { ...makeBoardQuest(DAY, t), timer: { startedAt: null, accumulatedMs: (t.durationMin ?? 0) * 60_000 } };
    renderCard(q, t, actions());
    expect(screen.getByText(/timed bonus earned/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('count quest: stepper increments and the minus is disabled at zero', () => {
    const t = templateOfKind('count');
    const q = makeBoardQuest(DAY, t);
    const a = actions();
    renderCard(q, t, a);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /increase/i }));
    expect(a.onIncrement).toHaveBeenCalledWith(q.instanceId, 1);
    expect(screen.getByText(`0 / ${t.targetCount ?? 1}`)).toBeInTheDocument();
  });

  it('done quest: shows the settled rewards and Undo while same-day', () => {
    const t = templateOfKind('check');
    const q: BoardQuest = { ...makeBoardQuest(DAY, t), status: 'done', rewards: { xp: 24, coins: 11, dp: 1, loyalty: 6, utility: 0 } };
    const a = actions();
    const { unmount } = renderCard(q, t, a, { canUndo: true });
    expect(screen.getByText(/settled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^done$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(a.onUndo).toHaveBeenCalledWith(q.instanceId);
    unmount();
    renderCard(q, t, a, { canUndo: false });
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.getByText(/settled for the day/i)).toBeInTheDocument();
  });
});
