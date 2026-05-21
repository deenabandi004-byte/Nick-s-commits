/**
 * FirmSearchResults.tsx - Google Sheets-style table for firm search results
 */

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Trash2,
  UserSearch,
  Loader2
} from 'lucide-react';
import { Firm } from '../services/api';

interface FirmSearchResultsProps {
  firms: Firm[];
  onViewContacts: (firm: Firm) => void;
  onDelete?: (firm: Firm) => void;
  deletingId?: string | null;
}

type SortField = 'name' | 'location' | 'industry';
type SortDirection = 'asc' | 'desc';

const mono = "'IBM Plex Mono', monospace";

const FIRM_COLS = [
  { key: 'name', letter: 'A', label: 'Company', width: '22%' },
  { key: 'website', letter: 'B', label: 'Website', width: '10%' },
  { key: 'linkedin', letter: 'C', label: 'LinkedIn', width: '10%' },
  { key: 'location', letter: 'D', label: 'Location', width: '22%' },
  { key: 'industry', letter: 'E', label: 'Industry', width: '20%' },
] as const;

const GUTTER_W = 40;
const CHECKBOX_W = 32;

export default function FirmSearchResults({ firms, onViewContacts, onDelete, deletingId }: FirmSearchResultsProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFirms, setFilteredFirms] = useState<Firm[]>(firms);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<{ firmKey: string; col: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFirms(firms);
      return;
    }
    const filtered = firms.filter((firm) => {
      const s = searchQuery.toLowerCase();
      return (
        firm.name?.toLowerCase().includes(s) ||
        firm.industry?.toLowerCase().includes(s) ||
        firm.location?.display?.toLowerCase().includes(s) ||
        firm.website?.toLowerCase().includes(s)
      );
    });
    setFilteredFirms(filtered);
  }, [searchQuery, firms]);

  const sortedFirms = [...filteredFirms].sort((a, b) => {
    let aVal: string, bVal: string;
    switch (sortField) {
      case 'name': aVal = a.name?.toLowerCase() || ''; bVal = b.name?.toLowerCase() || ''; break;
      case 'location': aVal = a.location?.display?.toLowerCase() || ''; bVal = b.location?.display?.toLowerCase() || ''; break;
      case 'industry': aVal = a.industry?.toLowerCase() || ''; bVal = b.industry?.toLowerCase() || ''; break;
      default: return 0;
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const getFirmKey = (firm: Firm): string => firm.id || `${firm.name}-${firm.location?.display}`;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFirms.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredFirms.map(f => getFirmKey(f))));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getActiveCellRef = (): string => {
    if (!activeCell) return 'A1';
    const col = FIRM_COLS.find(c => c.key === activeCell.col);
    const letter = col?.letter || 'A';
    const idx = sortedFirms.findIndex(f => getFirmKey(f) === activeCell.firmKey);
    return `${letter}${idx >= 0 ? idx + 1 : 1}`;
  };

  const getActiveCellValue = (): string => {
    if (!activeCell) return '';
    const firm = sortedFirms.find(f => getFirmKey(f) === activeCell.firmKey);
    if (!firm) return '';
    switch (activeCell.col) {
      case 'name': return firm.name || '';
      case 'website': return firm.website || '';
      case 'linkedin': return firm.linkedinUrl || '';
      case 'location': return firm.location?.display || '';
      case 'industry': return firm.industry || '';
      default: return '';
    }
  };

  const sortableFields: Record<string, SortField> = { name: 'name', location: 'location', industry: 'industry' };

  return (
    <div
      className="firm-search-results-page"
      style={{ fontFamily: mono, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#fff' }}
      onClick={(e) => { if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) setActiveCell(null); }}
    >
      {/* Toolbar */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: '#ffffff', borderBottom: '1px solid #E2E8F0',
      }}>
        <div className="relative firm-search-input-wrap" style={{ flex: '0 0 220px' }}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: '#bbb' }} />
          <input
            type="text" placeholder="Search..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontFamily: mono, fontSize: 12, color: '#2a2a2a', background: '#fff', border: '1px solid #E2E8F0', outline: 'none', padding: '4px 6px 4px 24px', width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#999' }}>
          {filteredFirms.length} firm{filteredFirms.length !== 1 ? 's' : ''}
          {searchQuery && ` of ${firms.length}`}
        </span>
      </div>

      {/* Formula Bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', height: 26, borderBottom: '1px solid #E2E8F0', background: '#fff' }}>
        <div style={{ width: 60, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRight: '1px solid #E2E8F0', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#2a2a2a', fontFamily: mono }}>
          {getActiveCellRef()}
        </div>
        <div style={{ padding: '0 10px', borderRight: '1px solid #E2E8F0', fontSize: 11, color: '#bbb', fontStyle: 'italic', fontFamily: mono, display: 'flex', alignItems: 'center', height: '100%' }}>fx</div>
        <div style={{ flex: 1, padding: '0 10px', fontSize: 12, color: '#2a2a2a', fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', height: '100%' }}>
          {getActiveCellValue()}
        </div>
      </div>

      {/* Sheet */}
      <div ref={sheetRef} style={{ flex: 1, overflow: 'auto' }}>
        {filteredFirms.length === 0 && firms.length > 0 && searchQuery ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontFamily: mono }}>
            <p style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>No firms match your search.</p>
            <button onClick={() => setSearchQuery('')} style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: mono }}>Clear search</button>
          </div>
        ) : filteredFirms.length > 0 && (
          <div className="firm-table-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="firm-table" style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontFamily: mono }}>
              <thead>
                {/* Column Letter Row */}
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: GUTTER_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', padding: 0 }} />
                  <th style={{ width: CHECKBOX_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', padding: 0 }} />
                  {FIRM_COLS.map((col) => {
                    const isActive = activeCell?.col === col.key;
                    return (
                      <th key={col.letter} style={{ fontSize: 10, color: isActive ? '#2a2a2a' : '#999', fontWeight: isActive ? 500 : 400, background: isActive ? '#f0f0ee' : '#ffffff', borderRight: '1px solid #E2E8F0', textAlign: 'center', padding: '3px 0', width: col.width }}>
                        {col.letter}
                      </th>
                    );
                  })}
                  <th style={{ background: '#ffffff', padding: 0, width: 100 }} />
                </tr>

                {/* Column Label Row */}
                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ width: GUTTER_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', fontSize: 10, color: '#999', textAlign: 'center', padding: '11px 0', position: 'sticky', top: 0, zIndex: 10 }}>#</th>
                  <th style={{ width: CHECKBOX_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', textAlign: 'center', padding: '11px 4px', position: 'sticky', top: 0, zIndex: 10 }}>
                    <input type="checkbox" checked={filteredFirms.length > 0 && selectedIds.size === filteredFirms.length} onChange={toggleSelectAll} style={{ width: 13, height: 13, accentColor: '#444', cursor: 'pointer' }} />
                  </th>
                  {FIRM_COLS.map((col) => {
                    const isActive = activeCell?.col === col.key;
                    const sortable = sortableFields[col.key];
                    return (
                      <th
                        key={col.key}
                        onClick={sortable ? () => handleSort(sortable) : undefined}
                        style={{ padding: '11px 12px', textAlign: 'left', fontSize: 10, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', background: isActive ? '#f0f0ee' : '#ffffff', whiteSpace: 'nowrap', width: col.width, cursor: sortable ? 'pointer' : 'default', position: 'sticky', top: 0, zIndex: 10 }}
                      >
                        {col.label}
                        {sortable && sortField === sortable && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                    );
                  })}
                  <th style={{ background: '#ffffff', padding: '11px 12px', textAlign: 'right', fontSize: 10, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', width: 100, position: 'sticky', top: 0, zIndex: 10 }} />
                </tr>
              </thead>
              <tbody>
                {sortedFirms.map((firm, index) => {
                  const key = getFirmKey(firm);
                  const isSelected = selectedIds.has(key);
                  const cellStyle = (col: string) => ({
                    padding: '0 12px' as const, whiteSpace: 'nowrap' as const, position: 'relative' as const,
                    ...(activeCell?.firmKey === key && activeCell?.col === col ? { outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1 } : {}),
                  });

                  return (
                    <tr
                      key={key}
                      style={{ height: 28, borderBottom: '1px solid #f0f0ee', background: isSelected ? '#f0f0ee' : 'white', transition: 'background 0.08s' }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f5f5f3'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#f0f0ee' : 'white'; }}
                    >
                      {/* Row Number */}
                      <td style={{ width: GUTTER_W, textAlign: 'center', fontSize: 10, color: isSelected ? '#fff' : '#999', background: isSelected ? '#555' : '#ffffff', borderRight: '1px solid #E2E8F0', padding: '0 4px' }}
                        onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.background = '#f0f0ee'; e.currentTarget.style.color = '#555'; } }}
                        onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#999'; } }}
                      >{index + 1}</td>

                      {/* Checkbox */}
                      <td style={{ width: CHECKBOX_W, textAlign: 'center', borderRight: '1px solid #E2E8F0', padding: '0 4px' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} style={{ width: 13, height: 13, accentColor: '#444', cursor: 'pointer' }} />
                      </td>

                      {/* Company */}
                      <td onClick={() => setActiveCell({ firmKey: key, col: 'name' })} style={cellStyle('name')}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#2a2a2a' }}>{firm.name || ' - '}</span>
                      </td>

                      {/* Website */}
                      <td onClick={() => setActiveCell({ firmKey: key, col: 'website' })} style={cellStyle('website')}>
                        {firm.website ? (
                          <a href={firm.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: '#555', textDecoration: 'none', borderBottom: '1px solid #E2E8F0', paddingBottom: 1 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                          >↗ site</a>
                        ) : <span style={{ color: '#bbb' }}> - </span>}
                      </td>

                      {/* LinkedIn */}
                      <td onClick={() => setActiveCell({ firmKey: key, col: 'linkedin' })} style={cellStyle('linkedin')}>
                        {firm.linkedinUrl ? (
                          <a href={firm.linkedinUrl.startsWith('http') ? firm.linkedinUrl : `https://${firm.linkedinUrl}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: '#555', textDecoration: 'none', borderBottom: '1px solid #E2E8F0', paddingBottom: 1 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                          >↗ view</a>
                        ) : <span style={{ color: '#bbb' }}> - </span>}
                      </td>

                      {/* Location */}
                      <td onClick={() => setActiveCell({ firmKey: key, col: 'location' })} style={cellStyle('location')}>
                        <span style={{ fontSize: 12, color: '#555' }}>{firm.location?.display || ' - '}</span>
                      </td>

                      {/* Industry */}
                      <td onClick={() => setActiveCell({ firmKey: key, col: 'industry' })} style={cellStyle('industry')}>
                        <span style={{ fontSize: 12, color: '#555' }}>{firm.industry || ' - '}</span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0 8px', whiteSpace: 'nowrap', textAlign: 'right', width: 100 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            onClick={() => onViewContacts(firm)}
                            style={{ fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #E2E8F0', background: '#fff', color: '#555', padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                          >
                            <UserSearch className="h-3 w-3" /> View
                          </button>
                          {onDelete && (
                            <button
                              onClick={() => onDelete(firm)} disabled={deletingId === key}
                              style={{ background: 'none', border: 'none', color: '#bbb', cursor: deletingId === key ? 'wait' : 'pointer', padding: 3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#c00'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                            >
                              {deletingId === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', height: 30, background: '#ffffff', borderTop: '1px solid #E2E8F0', fontFamily: mono }}>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 10, color: '#bbb', whiteSpace: 'nowrap' }}>
          {sortedFirms.length} rows · offerloop.ai
        </div>
      </div>

      {/* Mobile CSS */}
      <style>{`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `}</style>
    </div>
  );
}
