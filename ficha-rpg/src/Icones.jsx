const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const Icones = {
  celular: <Svg><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></Svg>,
  perfil: <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></Svg>,
  chat: <Svg><path d="M4 5h16v11H9l-5 4z" /></Svg>,
  pix: <Svg><path d="M12 3l9 9-9 9-9-9z" /><path d="M12 8l4 4-4 4-4-4z" /></Svg>,
  clove: <Svg><path d="M12 12C10 7 6 4 4 5c-2 1 0 6 2 8-2 1-3 3-1 5 2 2 5 0 7-6z" /><path d="M12 12c2-5 6-8 8-7 2 1 0 6-2 8 2 1 3 3 1 5-2 2-5 0-7-6z" /></Svg>,
  equipe: <Svg><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c1-3.5 3-5 6-5s5 1.5 6 5" /><path d="M15 15c3 0 5 1.2 6 4" /></Svg>,
  loja: <Svg><path d="M4 8h16l-1 12H5z" /><path d="M9 8a3 3 0 0 1 6 0" /></Svg>,
  mestre: <Svg><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>,
  admin: <Svg><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></Svg>
};
