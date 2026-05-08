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
  onMove?: (draggedId: string, targetId: string) => void;
};

export function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, onMove }: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-item ${tab.id === activeTabId ? "is-active" : ""}`}
          draggable={!!onMove}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", tab.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (!onMove) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (!onMove) return;
            event.preventDefault();
            const draggedId = event.dataTransfer.getData("text/plain");
            if (draggedId && draggedId !== tab.id) onMove(draggedId, tab.id);
          }}
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
