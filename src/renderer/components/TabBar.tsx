type TabBarItem = {
  id: string;
  title: string;
};

type TabBarProps = {
  tabs: TabBarItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
};

export function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose }: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-item ${tab.id === activeTabId ? "is-active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-title">{tab.title}</span>
          <span
            className="tab-close"
            role="button"
            aria-label={`Close ${tab.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
          >
            x
          </span>
        </button>
      ))}
      <button type="button" className="tab-add" onClick={onAdd} aria-label="New tab" title="New tab">
        +
      </button>
    </div>
  );
}
