// ================= car models =================
// Cars are built from lofted hulls (cross-sections swept along the car's length), detail
// primitives, and canvas-painted decals (windows, stripes, badges) projected onto the hull.
// Everything for one car ends up in a single multi-material mesh.

export const M_PAINT = 0, M_CHROME = 1, M_GLASS = 2, M_TRIM = 3, M_LAMP = 4, M_DECAL = 5, M_COUNT = 6;
export const C_CHROME = 0xe8e6e2, C_GUN = 0x55555c, C_BLACK = 0x1c1a1b, C_RUBBER = 0x262322, C_HEAD = 0xfff4d8, C_TAIL = 0xe0241a, C_AMBER = 0xff9a1a;
