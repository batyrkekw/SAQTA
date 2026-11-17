import styles from './sana-thread.module.css';

/*
 * The SANA ecosystem motif: one continuous thread that ends in a four-point spark.
 * In SAQTA the thread is read as a stem, so it can carry a leaf. Purely decorative.
 */
type Tone = 'forest' | 'lime' | 'clay';
type Variant = 'hero' | 'divider' | 'mini';

const paths: Record<Variant, { viewBox: string; d: string; spark: [number, number]; leaf?: [number, number, number] }> = {
  hero: { viewBox: '0 0 640 120', d: 'M4 104 C 120 40, 230 30, 330 70 S 520 118, 610 30', spark: [612, 28], leaf: [250, 46, -28] },
  divider: { viewBox: '0 0 1200 40', d: 'M0 30 C 220 6, 420 6, 600 22 S 980 38, 1170 12', spark: [1172, 11], leaf: [420, 12, -18] },
  mini: { viewBox: '0 0 120 36', d: 'M4 30 C 30 8, 58 8, 74 20 S 100 30, 106 10', spark: [107, 9] },
};

export function SanaSpark({ size = 14, className }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true" focusable="false">
    <path d="M0 -7 L1.9 -1.9 L7 0 L1.9 1.9 L0 7 L-1.9 1.9 L-7 0 L-1.9 -1.9 Z" fill="currentColor" />
  </svg>;
}

export function SanaThread({ variant = 'divider', tone = 'forest', className = '' }: { variant?: Variant; tone?: Tone; className?: string }) {
  const shape = paths[variant];
  return <svg className={`${styles.thread} ${styles[tone]} ${styles[variant]} ${className}`} viewBox={shape.viewBox} aria-hidden="true" focusable="false">
    <path className={styles.line} d={shape.d} pathLength={1} vectorEffect="non-scaling-stroke" />
    {/* SVG transform attributes live on the outer group; CSS animations only touch the inner shape. */}
    {shape.leaf && <g transform={`translate(${shape.leaf[0]} ${shape.leaf[1]}) rotate(${shape.leaf[2]})`}>
      <path className={styles.leaf} d="M0 0 C 6 -10, 18 -12, 26 -6 C 18 2, 8 4, 0 0 Z" />
    </g>}
    <g transform={`translate(${shape.spark[0]} ${shape.spark[1]})`}>
      <path className={styles.spark} d="M0 -8 L2.2 -2.2 L8 0 L2.2 2.2 L0 8 L-2.2 2.2 L-8 0 L-2.2 -2.2 Z" />
    </g>
  </svg>;
}
