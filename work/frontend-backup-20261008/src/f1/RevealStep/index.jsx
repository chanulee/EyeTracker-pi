import { useEffect, useState } from 'react';
import { AGENT_DIALOGUE, REVEAL_AGENT_DIALOGUE_MS } from '../../shared/gazeConfig';
import VisionCard from '../VoteStep/VisionCard';
import styles from './RevealStep.module.css';

export default function RevealStep({ winnerCard, onComplete }) {
  const [showDialogue, setShowDialogue] = useState(false);
  const [dialogueDone, setDialogueDone] = useState(false);

  useEffect(() => {
    const t2 = setTimeout(() => setShowDialogue(true), 1400);
    const t3 = setTimeout(() => setDialogueDone(true), 1400 + REVEAL_AGENT_DIALOGUE_MS);

    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  useEffect(() => {
    if (!dialogueDone) return undefined;
    const t = setTimeout(() => onComplete?.(), 800);
    return () => clearTimeout(t);
  }, [dialogueDone, onComplete]);

  return (
    <section className={styles.revealStep}>
      <div className={styles.winnerArea}>
        <VisionCard card={winnerCard} intensity={1} isWinner compact />
        <p className={styles.winnerLabel}>{winnerCard.label}</p>
      </div>

      <div className={`${styles.dialogue} ${showDialogue ? styles.visible : ''}`}>
        <span className={styles.agentTag}>AI Agent</span>
        <p className={styles.dialogueText}>{AGENT_DIALOGUE}</p>
      </div>
    </section>
  );
}
