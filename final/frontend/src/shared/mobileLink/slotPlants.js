/** @typedef {{ drawingUrl?: string | null, plantName?: string, plantImage?: string, plantVariant?: string, sent?: boolean }} SlotPlant */

/** @typedef {{ A?: SlotPlant, B?: SlotPlant }} SlotPlantsMap */

/**
 * 폰이 고른 자리(payload.slot)를 우선한다. 서버 봉투 slot 과 어긋나면
 * 화면에 뜬 식물이 반대쪽 키오스크 자리로 가는 것을 막는다.
 * @param {'A' | 'B' | null | undefined} slot
 * @param {{ slot?: string }} [payload]
 * @returns {'A' | 'B' | null}
 */
export function resolvePlantSlot(slot, payload) {
  if (payload?.slot === 'A' || payload?.slot === 'B') return payload.slot;
  if (slot === 'A' || slot === 'B') return slot;
  return null;
}

/**
 * @param {SlotPlantsMap} prev
 * @param {'A' | 'B'} slot
 * @param {{ type?: string, drawingUrl?: string | null, plantName?: string, slot?: string }} payload
 */
export function mergeSlotPlantFromState(prev, slot, payload) {
  const resolved = resolvePlantSlot(slot, payload);
  if (!resolved) return prev;
  const type = payload?.type;
  if (type !== 'plant_drawing' && type !== 'plant_sent') return prev;

  const current = prev[resolved] ?? {};
  const next = { ...current };

  if (type === 'plant_drawing' && payload.drawingUrl) {
    next.drawingUrl = payload.drawingUrl;
  }
  if (type === 'plant_sent') {
    next.sent = true;
    if (typeof payload.plantImage === 'string' && payload.plantImage) {
      next.plantImage = payload.plantImage;
    }
    if (typeof payload.plantVariant === 'string' && payload.plantVariant) {
      next.plantVariant = payload.plantVariant;
    }
  }
  if (typeof payload.plantName === 'string' && payload.plantName.trim()) {
    next.plantName = payload.plantName.trim();
  }

  if (
    next.drawingUrl === current.drawingUrl &&
    next.plantName === current.plantName &&
    next.sent === current.sent &&
    next.plantImage === current.plantImage &&
    next.plantVariant === current.plantVariant
  ) {
    return prev;
  }
  return { ...prev, [resolved]: next };
}

export function bothSlotsHaveDrawing(slotPlants) {
  return Boolean(slotPlants?.A?.drawingUrl && slotPlants?.B?.drawingUrl);
}

/** 모바일 END 화면에서 전송(plant_sent)까지 둘 다 완료 */
export function bothSlotsHaveSent(slotPlants) {
  return Boolean(
    slotPlants?.A?.sent &&
      slotPlants?.B?.sent &&
      slotPlants?.A?.drawingUrl &&
      slotPlants?.B?.drawingUrl
  );
}

/** QR·접속만 완료 (슬롯 A·B 모두 연결) */
export function bothSlotsConnected(slots) {
  return Boolean(slots?.A && slots?.B);
}

// Only NABI supplies a phone drawing in this exhibition. SORA is scripted.
export function participantHasSent(slotPlants) {
  return Boolean(slotPlants?.A?.sent && slotPlants.A.drawingUrl);
}

export function participantConnected(slots) {
  return Boolean(slots?.A);
}
