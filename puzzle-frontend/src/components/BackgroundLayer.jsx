import { useEffect, useRef } from 'react';
import { BACKGROUNDS } from '../config';

// ============================================================
// Calque de fond plein écran — indépendant du plateau de jeu.
// Une vidéo (lofi, pluie...) ou une animation reste donc toujours nette
// et pleine résolution quel que soit le zoom appliqué au puzzle :
// elle vit en dehors de la scène PIXI, fixée derrière elle en CSS.
// Les fonds animés intégrés n'animent que transform/opacity : le GPU
// les compose sans rien redessiner, même en 4K.
// ============================================================
const BASE_STYLE = { position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' };

function VideoBackground({ bg, paused }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, bg.value]);
  return (
    <video
      ref={ref}
      key={bg.value}
      autoPlay={!paused}
      loop
      muted
      playsInline
      preload="auto"
      poster={bg.poster}
      disablePictureInPicture
      style={{ ...BASE_STYLE, width: '100%', height: '100%', objectFit: 'cover', background: '#0e0f12' }}
    >
      <source src={bg.value} />
    </video>
  );
}

export default function BackgroundLayer({ background, paused = false }) {
  const bg = background || BACKGROUNDS[0];

  if (bg.type === 'video') return <VideoBackground bg={bg} paused={paused} />;

  if (bg.type === 'animated') {
    return (
      <div className={`bg-anim bg-${bg.value}${paused ? ' bg-paused' : ''}`} style={BASE_STYLE}>
        <i /><i /><i />
      </div>
    );
  }

  const style = { ...BASE_STYLE };
  if (bg.type === 'image') {
    style.backgroundImage = `url(${bg.value})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
    style.backgroundColor = '#0e0f12';
  } else if (bg.value && bg.value.includes('gradient')) {
    style.backgroundImage = bg.value;
  } else {
    style.backgroundColor = bg.value;
  }
  return <div style={style} />;
}
