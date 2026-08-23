import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type DeepPartial,
  type ChartOptions,
} from 'lightweight-charts'

export type ThemeName = 'dark' | 'light'

interface Palette {
  background: string
  text: string
  grid: string
  border: string
  crosshair: string
  bull: string
  bear: string
  bullFill: string
  bearFill: string
  volumeUp: string
  volumeDown: string
  watermark: string
}

/** Colors mirror the TradingView / exchange default dark & light schemes. */
export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    background: '#131722',
    text: '#d1d4dc',
    grid: '#1e222d',
    border: '#2b3145',
    crosshair: '#758696',
    bull: '#26a69a',
    bear: '#ef5350',
    bullFill: '#26a69a',
    bearFill: '#ef5350',
    volumeUp: 'rgba(38, 166, 154, 0.5)',
    volumeDown: 'rgba(239, 83, 80, 0.5)',
    watermark: 'rgba(209, 212, 220, 0.05)',
  },
  light: {
    background: '#ffffff',
    text: '#131722',
    grid: '#eef1f5',
    border: '#d6dae2',
    crosshair: '#9598a1',
    bull: '#089981',
    bear: '#f23645',
    bullFill: '#089981',
    bearFill: '#f23645',
    volumeUp: 'rgba(8, 153, 129, 0.45)',
    volumeDown: 'rgba(242, 54, 69, 0.45)',
    watermark: 'rgba(19, 23, 34, 0.04)',
  },
}

export function chartOptions(theme: ThemeName): DeepPartial<ChartOptions> {
  const p = PALETTES[theme]
  return {
    layout: {
      background: { type: ColorType.Solid, color: p.background },
      textColor: p.text,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: p.grid },
      horzLines: { color: p.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: p.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: p.border,
      },
      horzLine: {
        color: p.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: p.border,
      },
    },
    rightPriceScale: {
      borderColor: p.border,
      // Leave room at the bottom for the volume histogram overlay.
      scaleMargins: { top: 0.08, bottom: 0.24 },
      entireTextOnly: true,
    },
    timeScale: {
      borderColor: p.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 4,
      barSpacing: 8,
      minBarSpacing: 0.5,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
    },
    localization: { locale: 'en-US' },
  }
}

export const VOLUME_SCALE_ID = 'volume'
export const VOLUME_SCALE_MARGINS = { top: 0.78, bottom: 0 }
