/**
 * Does a title fit the habit card on ONE line at full size on a 375pt phone?
 * Mirrors backend/services/card_title.py (same Matter-SemiBold 17pt widths and
 * budget). Cards never wrap or shrink a title, so anything longer is shortened
 * by the server, and a custom task's name is checked here before saving.
 */
export const CARD_TITLE_MAX_WIDTH = 168;
const TRACKING = -0.3;

// Matter-SemiBold advance widths at 17pt, per character.
const W: Record<string, number> = {" ": 4.08, "!": 4.981, "\"": 7.106, "#": 11.781, "$": 10.047, "%": 13.362, "&": 11.56, "'": 3.842, "(": 4.964, ")": 4.964, "*": 8.279, "+": 9.469, ",": 5.1, "-": 6.392, ".": 4.743, "/": 7.786, "0": 10.863, "1": 6.443, "2": 9.758, "3": 9.996, "4": 10.727, "5": 9.877, "6": 10.472, "7": 9.52, "8": 9.894, "9": 10.54, ":": 4.743, ";": 5.185, "<": 9.333, "=": 9.333, ">": 9.333, "?": 8.976, "@": 15.521, "A": 11.543, "B": 10.71, "C": 12.41, "D": 11.713, "E": 9.86, "F": 9.69, "G": 12.784, "H": 12.087, "I": 4.556, "J": 6.154, "K": 11.424, "L": 9.163, "M": 14.722, "N": 11.866, "O": 13.243, "P": 10.234, "Q": 13.277, "R": 11.05, "S": 10.047, "T": 10.013, "U": 11.628, "V": 11.135, "W": 17.153, "X": 10.574, "Y": 10.557, "Z": 10.234, "[": 5.406, "\\": 7.786, "]": 5.406, "^": 9.894, "_": 8.5, "`": 18.207, "a": 9.163, "b": 10.285, "c": 9.537, "d": 10.285, "e": 9.69, "f": 6.477, "g": 10.115, "h": 10.132, "i": 4.216, "j": 4.284, "k": 9.537, "l": 4.216, "m": 15.249, "n": 10.064, "o": 10.098, "p": 10.285, "q": 10.285, "r": 6.902, "s": 7.837, "t": 6.562, "u": 10.081, "v": 8.517, "w": 13.396, "x": 8.721, "y": 8.976, "z": 8.415, "{": 5.746, "|": 4.59, "}": 5.763, "~": 10.166, "·": 4.692, "×": 9.673, "à": 9.163, "ç": 9.537, "è": 9.69, "é": 9.69, "ñ": 10.064, "ö": 10.098, "ü": 10.081, "–": 8.5, "—": 17.0, "‘": 4.471, "’": 4.471, "“": 7.667, "”": 7.667, "•": 8.007};

export function cardTitleWidth(title: string): number {
    const t = title || '';
    if (!t) return 0;
    let sum = 0;
    for (const c of t) sum += W[c] ?? W.m;
    return sum + TRACKING * (t.length - 1);
}

export function cardTitleFits(title: string): boolean {
    return cardTitleWidth(title) <= CARD_TITLE_MAX_WIDTH;
}
