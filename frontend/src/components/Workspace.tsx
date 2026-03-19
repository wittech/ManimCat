/**
 * 工作空间 - 合并 历史记录 / 提示词管理 / 用量统计
 */

import { useEffect, useState } from 'react';
import { HistoryPanel } from './HistoryPanel';
import { usePrompts } from '../hooks/usePrompts';
import { PromptSidebar } from './PromptSidebar';
import { UsageDashboardContent } from './UsageDashboard';
import type { RoleType, SharedModuleType } from '../types/api';
import { useI18n } from '../i18n';

type WorkspaceModule = 'history' | 'prompts' | 'usage';

interface WorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  initialModule?: WorkspaceModule;
  onReusePrompt?: (prompt: string) => void;
}

export function Workspace({ isOpen, onClose, initialModule = 'history', onReusePrompt }: WorkspaceProps) {
  const { t } = useI18n();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);
  const [activeModule, setActiveModule] = useState<WorkspaceModule>(initialModule);

  const {
    isLoading: promptsLoading,
    selection,
    setSelection,
    getCurrentContent,
    setCurrentContent,
    restoreCurrent,
    hasOverride,
  } = usePrompts();

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setActiveModule(initialModule);
      setTimeout(() => setIsVisible(true), 50);
    } else {
      setIsVisible(false);
      const timeout = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, initialModule]);

  if (!shouldRender) return null;

  const breadcrumbMap: Record<WorkspaceModule, string> = {
    history: t('workspace.breadcrumb.history'),
    prompts: t('workspace.breadcrumb.prompts'),
    usage: t('workspace.breadcrumb.usage'),
  };

  const railItems: { id: WorkspaceModule; label: string; icon: JSX.Element }[] = [
    {
      id: 'history',
      label: t('workspace.rail.history'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'prompts',
      label: t('workspace.rail.prompts'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
    },
    {
      id: 'usage',
      label: t('workspace.rail.usage'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M6 16V9m6 7V5m6 11v-4" />
        </svg>
      ),
    },
  ];

  // 提示词编辑区标题
  const getPromptTitle = () => {
    const roleLabels: Record<RoleType, string> = {
      problemFraming: t('prompts.role.problemFraming'),
      conceptDesigner: t('prompts.role.conceptDesigner'),
      codeGeneration: t('prompts.role.codeGeneration'),
      codeRetry: t('prompts.role.codeRetry'),
      codeEdit: t('prompts.role.codeEdit'),
    };
    const sharedLabels: Record<SharedModuleType, string> = {
      knowledge: t('prompts.shared.knowledge'),
      rules: t('prompts.shared.rules'),
    };

    if (selection.kind === 'role') {
      const roleLabel = roleLabels[selection.role];
      return selection.promptType === 'system'
        ? t('prompts.role.systemTitle', { role: roleLabel })
        : t('prompts.role.userTitle', { role: roleLabel });
    }
    return sharedLabels[selection.module];
  };

  const getPromptDescription = () => {
    if (selection.kind === 'role') {
      return selection.promptType === 'system'
        ? t('prompts.role.systemDescription')
        : t('prompts.role.userDescription');
    }
    return selection.module === 'knowledge'
      ? t('prompts.shared.knowledgeDescription')
      : t('prompts.shared.rulesDescription');
  };

  const promptContent = getCurrentContent();
  const isModified = hasOverride();

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-bg-primary transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* 顶栏 */}
      <div className="h-14 bg-bg-secondary/50 border-b border-bg-tertiary/30 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-text-secondary/70 hover:text-text-primary hover:bg-bg-tertiary/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-text-primary">{t('workspace.title')}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* 提示词模块：修改状态 + 恢复按钮 */}
          {activeModule === 'prompts' && isModified && (
            <>
              <span className="text-xs text-accent/70">{t('prompts.modified')}</span>
              <button
                onClick={restoreCurrent}
                className="px-3 py-1.5 text-xs text-text-secondary/70 hover:text-text-primary hover:bg-bg-tertiary/50 rounded-lg transition-colors"
              >
                {t('prompts.restore')}
              </button>
            </>
          )}
          <div className="text-[10px] text-text-secondary/30 uppercase tracking-widest">
            Workspace / <span className="text-text-secondary/60">{breadcrumbMap[activeModule]}</span>
          </div>
        </div>
      </div>

      {/* 核心交互区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧 Rail 导航 */}
        <aside className="w-14 bg-bg-secondary/20 border-r border-bg-tertiary/30 flex flex-col items-center py-4 gap-2">
          {railItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                activeModule === item.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-bg-tertiary/30'
              }`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </aside>

        {/* 模块展示区 */}
        <div className="flex-1 flex overflow-hidden">
          {/* History */}
          {activeModule === 'history' && (
            <main className="flex-1 p-8 overflow-y-auto bg-bg-primary">
              <HistoryPanel isActive={activeModule === 'history'} onReusePrompt={onReusePrompt} />
            </main>
          )}

          {/* Prompts */}
          {activeModule === 'prompts' && (
            <>
              <PromptSidebar selection={selection} onSelect={setSelection} />
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-bg-tertiary/30">
                  <h2 className="text-base font-medium text-text-primary">{getPromptTitle()}</h2>
                  <p className="text-xs text-text-secondary/60 mt-1">{getPromptDescription()}</p>
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  {promptsLoading ? (
                    <div className="h-full flex items-center justify-center text-text-secondary/50 text-sm">
                      {t('common.loading')}
                    </div>
                  ) : (
                    <textarea
                      value={promptContent}
                      onChange={e => setCurrentContent(e.target.value)}
                      className="w-full h-full px-4 py-3 bg-bg-secondary/30 border border-bg-tertiary/30 rounded-lg text-sm text-text-primary font-mono leading-relaxed resize-none focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 transition-colors"
                      placeholder={t('prompts.placeholder')}
                    />
                  )}
                </div>
                <div className="px-6 py-3 border-t border-bg-tertiary/30 flex items-center justify-between text-xs text-text-secondary/50">
                  <span>{t('prompts.characters', { count: promptContent.length })}</span>
                  <span>{t('prompts.autosave')}</span>
                </div>
              </div>
            </>
          )}

          {/* Usage */}
          {activeModule === 'usage' && (
            <main className="flex-1 overflow-y-auto bg-bg-primary">
              <UsageDashboardContent isActive={activeModule === 'usage'} />
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
