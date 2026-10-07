import { useCallback } from 'react';
import DiscussionStep from '../src/f2/DiscussionStep';
import EntryPageShell from '../src/shared/EntryPageShell';
import { useEntryFlow } from '../src/shared/EntryFlowContext';
import styles from '../src/f2/DonePanel.module.css';

const DIRECT_CARD = { id: '', label: '', shortLabel: '' };

export default function StreetDiscussionPage() {
  const {
    isReady,
    winnerCard,
    pins,
    setPins,
    discussionDone,
    setDiscussionDone,
    gazePosition,
    registerGazeHandler,
    handleGazeClipChange,
  } = useEntryFlow();

  const handleDiscussionComplete = useCallback(
    (finalPins) => {
      const serialized = finalPins.map((pin) => ({
        ...pin,
        likedBy: Array.from(pin.likedBy),
      }));
      console.log('[EntryToDiscussion] Discussion complete:', serialized);
      setDiscussionDone(true);
    },
    [setDiscussionDone]
  );

  return (
    <EntryPageShell title="거리뷰 토론" showReticle={!discussionDone}>
      {isReady && !discussionDone && (
        <DiscussionStep
          winnerCard={winnerCard || DIRECT_CARD}
          pins={pins}
          onPinsChange={setPins}
          onComplete={handleDiscussionComplete}
          registerGazeHandler={registerGazeHandler}
          onGazeClipChange={handleGazeClipChange}
          gazePosition={gazePosition}
        />
      )}

      {discussionDone && (
        <section className={styles.doneStep}>
          <h2 className={styles.doneTitle}>의견 수집 완료</h2>
          <p className={styles.doneDesc}>
            {pins.length}개의 의견이 수집되었습니다. 다음 온보딩 단계로 이어질 자리입니다.
          </p>
          <pre className={styles.donePreview}>
            {JSON.stringify(
              pins.map((pin) => ({ ...pin, likedBy: Array.from(pin.likedBy) })),
              null,
              2
            )}
          </pre>
        </section>
      )}
    </EntryPageShell>
  );
}
