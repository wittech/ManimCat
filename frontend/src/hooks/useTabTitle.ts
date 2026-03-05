import { useEffect } from 'react';
import type { ProcessingStage } from '../types/api';

type GenerationStatus = 'idle' | 'processing' | 'completed' | 'error';

const BASE_TITLE = 'ManimCat - 数学动画生成器';
const TITLE_SCROLL_INTERVAL_MS = 220;

function getStageTitle(stage: ProcessingStage): string {
  switch (stage) {
    case 'analyzing':
      return '分析题意';
    case 'generating':
      return '生成代码';
    case 'refining':
      return '优化代码';
    case 'rendering':
    case 'still-rendering':
      return '渲染视频';
    default:
      return '处理中';
  }
}

function getTabTitle(status: GenerationStatus, stage: ProcessingStage): string {
  if (status === 'processing') {
    return `( •̀ᴗ•́ )و 生成中 · ${getStageTitle(stage)} - ManimCat`;
  }
  if (status === 'completed') {
    return '(ﾉ>ω<)ﾉ 已完成，点击查看 - ManimCat';
  }
  if (status === 'error') {
    return "(；′⌒`) 生成失败，点击重试 - ManimCat";
  }
  return BASE_TITLE;
}

export function useTabTitle(status: GenerationStatus, stage: ProcessingStage): void {
  useEffect(() => {
    const title = getTabTitle(status, stage);
    let scrollTimer: number | null = null;

    const stopScroll = () => {
      if (scrollTimer !== null) {
        window.clearInterval(scrollTimer);
        scrollTimer = null;
      }
    };

    const applyTitleBehavior = () => {
      const shouldScroll =
        document.hidden && (status === 'processing' || status === 'completed' || status === 'error');

      if (!shouldScroll) {
        stopScroll();
        document.title = title;
        return;
      }

      const loopText = `   ${title}   `;
      let cursor = 0;
      stopScroll();
      scrollTimer = window.setInterval(() => {
        const rendered = `${loopText.slice(cursor)}${loopText.slice(0, cursor)}`;
        document.title = rendered;
        cursor = (cursor + 1) % loopText.length;
      }, TITLE_SCROLL_INTERVAL_MS);
    };

    applyTitleBehavior();
    document.addEventListener('visibilitychange', applyTitleBehavior);

    return () => {
      stopScroll();
      document.removeEventListener('visibilitychange', applyTitleBehavior);
      document.title = BASE_TITLE;
    };
  }, [status, stage]);
}

