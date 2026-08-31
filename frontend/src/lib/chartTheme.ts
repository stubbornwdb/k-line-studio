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
    background: '#181a1d',
    text: '#e7e6e2',
    grid: '#25282b',
    border: '#36393d',
    crosshair: '#858a8c',
    bull: '#eb6767',
    bear: '#4abe84',
    bullFill: '#eb6767',
    bearFill: '#4abe84',
    volumeUp: 'rgba(235, 103, 103, 0.5)',
    volumeDown: 'rgba(74, 190, 132, 0.5)',
    watermark: 'rgba(231, 230, 226, 0.05)',
  },
  light: {
    background: '#faf9f7',
    text: '#1c1e21',
    grid: '#ecebe7',
    border: '#dcdad5',
    crosshair: '#8f918f',
    bull: '#c63f3f',
    bear: '#1c8e5e',
    bullFill: '#c63f3f',
    bearFill: '#1c8e5e',
    volumeUp: 'rgba(198, 63, 63, 0.42)',
    volumeDown: 'rgba(28, 142, 94, 0.42)',
    watermark: 'rgba(28, 30, 33, 0.04)',
  },
}

export function chartOptions(theme: ThemeName): DeepPartial<ChartOptions> {
  const p = PALETTES[theme]
  return {
    layout: {
      background: { type: ColorType.Solid, color: p.background },
      textColor: p.text,
      fontFamily: 'Avenir Next, PingFang SC, Hiragino Sans GB, sans-serif',
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
