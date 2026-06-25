const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generatePin = (): string =>
    Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
