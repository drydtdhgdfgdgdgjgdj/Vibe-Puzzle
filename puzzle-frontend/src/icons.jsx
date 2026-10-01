// ============================================================
// Icônes SVG minimalistes (trait fin, style cohérent).
// Remplacent les emojis pour un rendu plus sobre et professionnel.
// Toutes acceptent une prop `size` (défaut 18) et `className`.
// ============================================================

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const HomeIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1V16a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3.5a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V10" />
  </svg>
);

export const SettingsIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19.6a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 11.5 4.4V4.3a2 2 0 1 1 4 0v.09c.02.67.4 1.28 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08c.28.63.89 1.04 1.56 1.06h.2a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
  </svg>
);

export const HelpIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.8-2.4 1.9-2.6 3.6" />
    <circle cx="12" cy="16.9" r="0.25" fill="currentColor" stroke="none" />
  </svg>
);

export const TargetIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const MusicIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M9 18V5.8L20 4v11.2" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="15.2" r="2.5" />
  </svg>
);

export const UsersIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8.2" r="3" />
    <path d="M3 19.5c0-3.3 2.7-5.8 6-5.8s6 2.5 6 5.8" />
    <path d="M16.2 5.6a3 3 0 0 1 0 5.7" />
    <path d="M18.5 14.2c2.4.6 4 2.6 4 5.3" />
  </svg>
);

export const UploadIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 15.5V4" />
    <path d="M7.5 8.3 12 3.8l4.5 4.5" />
    <path d="M4.5 15.5v3.3a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7v-3.3" />
  </svg>
);

export const DownloadIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5v11.7" />
    <path d="M7.5 10.9 12 15.4l4.5-4.5" />
    <path d="M4.5 18.5v1.3a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7v-1.3" />
  </svg>
);

export const CheckIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12.8 9 18 20 6" />
  </svg>
);

export const CloseIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M5 5l14 14M19 5 5 19" />
  </svg>
);

export const ChevronIcon = ({ size = 18, className, direction = 'right' }) => {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[direction] || 0;
  return (
    <svg {...base(size)} className={className} style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
};

export const CrownIcon = ({ size = 14, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4 18h16" />
    <path d="M4.5 18 3 8.5l4.8 3.3L12 5l4.2 6.8 4.8-3.3L19.5 18Z" />
  </svg>
);

export const ImageIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="3.3" y="4.5" width="17.4" height="15" rx="1.8" />
    <circle cx="8.3" cy="9.5" r="1.6" />
    <path d="m4 17.5 5.5-5.2a1.6 1.6 0 0 1 2.1-.05L16 16" />
    <path d="m13.8 14.2 1.4-1.3a1.6 1.6 0 0 1 2.1-.03L20.6 15.5" />
  </svg>
);

export const VideoIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="2.8" y="5.5" width="13" height="13" rx="1.8" />
    <path d="m15.8 10 5.4-3.2v10.4L15.8 14Z" />
  </svg>
);

export const PaletteIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.3c-5 0-9 3.8-9 8.6 0 3.6 2.6 5.4 4.8 5.4.9 0 1.4-.5 1.4-1.2 0-.6-.4-.9-.4-1.8 0-1.2 1-2.1 2.4-2.1h2.4c3 0 5.4-2 5.4-5 0-2.1-2.5-3.9-7-3.9Z" />
    <circle cx="7.6" cy="10.8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.6" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="7.9" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16.8" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const LockIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.8" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </svg>
);

export const UnlockIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.8" />
    <path d="M8 10.5V7.8a4 4 0 0 1 7.3-2.3" />
  </svg>
);

export const TrophyIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M7 4.5h10v4.3a5 5 0 0 1-10 0Z" />
    <path d="M7 6H4.3a.8.8 0 0 0-.8.9c.2 2 1.5 3.4 3.6 3.7" />
    <path d="M17 6h2.7a.8.8 0 0 1 .8.9c-.2 2-1.5 3.4-3.6 3.7" />
    <path d="M12 13.8v3" />
    <path d="M8.5 19.8h7" />
    <path d="M9.6 19.8c0-1.6.8-2.4 2.4-2.8 1.6.4 2.4 1.2 2.4 2.8" />
  </svg>
);

export const ClockIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.3l3.6 2.1" />
  </svg>
);

export const ShieldIcon = ({ size = 16, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.3 19 6v5.4c0 4.6-3 8.2-7 9.3-4-1.1-7-4.7-7-9.3V6Z" />
    <path d="m9 12 2.1 2.1L15.5 9.5" />
  </svg>
);

export const UserIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8.3" r="3.5" />
    <path d="M4.5 20c0-3.8 3.4-6.5 7.5-6.5s7.5 2.7 7.5 6.5" />
  </svg>
);

export const ShapesIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="15.5" r="4" />
    <rect x="12.8" y="4.2" width="7.2" height="7.2" rx="1.5" />
    <path d="M8 4 11.5 11H4.5Z" />
  </svg>
);

export const FocusIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3" />
    <path d="M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3" />
    <path d="M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3" />
    <path d="M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.2" />
  </svg>
);

export const UserMinusIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="8.3" r="3.5" />
    <path d="M3 20c0-3.8 3.1-6.5 7-6.5 1.6 0 3 .4 4.2 1.2" />
    <path d="M16 17.5h5" />
  </svg>
);

export const EyeIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const PingIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="9.5" opacity="0.5" />
  </svg>
);

export const BroomIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M19.5 4.5 12 12" />
    <path d="M10.5 10.5 13.5 13.5" />
    <path d="M9.6 11.4c-2.2.4-4 1.7-5.6 4.3l4.3 4.3c2.6-1.6 3.9-3.4 4.3-5.6" />
    <path d="M6.5 17.5 8 16" />
  </svg>
);

export const CopyIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="1.8" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
);

export const TrashIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
);

export const MoreIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const RefreshIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </svg>
);

export const VolumeIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export const VolumeOffIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </svg>
);

export const PlayIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M8 5.5v13l10-6.5Z" />
  </svg>
);

export const CropIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M6.5 3v13.5a1 1 0 0 0 1 1H21" />
    <path d="M3 6.5h13.5a1 1 0 0 1 1 1V21" />
  </svg>
);

export const LassoIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M7.5 15.5C4.8 14.4 3 12.4 3 10c0-3.9 4-7 9-7s9 3.1 9 7-4 7-9 7c-1 0-2-.1-2.9-.4" />
    <circle cx="8" cy="17" r="1.8" />
    <path d="M8 18.8c0 1.3-.7 2.2-2 2.7" />
  </svg>
);

export const PolygonIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5 20 9l-3 10H7L4 9Z" />
    <circle cx="12" cy="3.5" r="1" fill="currentColor" />
    <circle cx="20" cy="9" r="1" fill="currentColor" />
    <circle cx="17" cy="19" r="1" fill="currentColor" />
    <circle cx="7" cy="19" r="1" fill="currentColor" />
    <circle cx="4" cy="9" r="1" fill="currentColor" />
  </svg>
);

export const EdgesIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
    <rect x="8" y="8" width="8" height="8" rx="1" strokeDasharray="2 2" />
  </svg>
);

export const BugIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="7.5" y="7.5" width="9" height="12" rx="4.5" />
    <path d="M9.5 7.5a2.5 2.5 0 0 1 5 0" />
    <path d="M3.5 13h4M16.5 13h4M4.5 8.5l3 1.5M19.5 8.5l-3 1.5M4.5 18l3-1.5M19.5 18l-3-1.5" />
  </svg>
);

export const KeyboardIcon = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10" />
  </svg>
);
