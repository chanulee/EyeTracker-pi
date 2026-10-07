// 페이지 2 거리뷰는 구와 관계없이 이 360도 장면만 쓴다.
const RED_ROAD = {
  image: '/street/red/assets/street-panorama.webp',
  yawSpan: 360,
  zoom: 1,
};

export function streetSceneForDistrict(district) {
  return {
    ...RED_ROAD,
    id: district?.id || 1,
    name: district?.name || '붉은 도로',
    pending: false,
  };
}
