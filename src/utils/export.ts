import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PackingList, ListZone, ListComponent } from '../types';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

export const flattenComponents = (components: ListComponent[]) => {
  const flat: ListComponent[] = [];
  components.forEach(c => {
    if (c.type === 'template' && c.templateContents) {
      c.templateContents.forEach(tc => {
        const existing = flat.find(f => f.type === tc.type && f.referenceId === tc.referenceId);
        if (existing) {
          existing.quantity += (tc.quantity * c.quantity);
        } else {
          flat.push({
            ...tc,
            uniqueId: generateId(),
            quantity: tc.quantity * c.quantity
          } as ListComponent);
        }
      });
    } else {
      const existing = flat.find(f => f.type === c.type && f.referenceId === c.referenceId);
      if (existing) {
        existing.quantity += c.quantity;
      } else {
        flat.push({ ...c });
      }
    }
  });
  return flat;
};

export const calculateZoneTotals = (zone: ListZone) => {
  const totalsMap = new Map<string, number>();
  const flatComps = flattenComponents(zone.sections.flatMap(s => s.components));
  
  flatComps.forEach(c => {
      totalsMap.set(c.name, (totalsMap.get(c.name) || 0) + c.quantity);
      c.contents?.forEach(sub => totalsMap.set(sub.name, (totalsMap.get(sub.name) || 0) + (sub.quantity * c.quantity)));
  });
  return totalsMap;
};

export const exportPDF = (activeList: PackingList) => {
  if (!activeList || !activeList.zones) return;
  
  const doc = new jsPDF();
  
  const printHeader = (zoneName: string, pageNumber: number) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      const eventName = activeList.eventName.toUpperCase();
      doc.text(eventName, 14, 12);

      const versionText = activeList.version ? `v${activeList.version}` : 'LISTA NON PRONTA';
      const titleWidth = doc.getTextWidth(eventName);
      doc.setFontSize(10);
      if (!activeList.version) doc.setTextColor(220, 0, 0);
      else doc.setTextColor(100);
      doc.text(versionText, 14 + titleWidth + 3, 12);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`${activeList.eventDate}  |  Pagina ${pageNumber}`, pageWidth - 14, 12, { align: 'right' });

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(`ZONA: ${zoneName.toUpperCase()}`, 14, 20);
  };

  activeList.zones.forEach((zone, index) => {
      if (index > 0) doc.addPage();
      
      let currentY = 25;
      if (zone.notes) {
          const splitNotes = doc.splitTextToSize(`NOTE: ${zone.notes}`, 174);
          const boxHeight = (splitNotes.length * 5) + 6;
          
          // Background light yellow
          doc.setFillColor(255, 255, 204);
          doc.rect(14, currentY, 182, boxHeight, 'F');
          
          // Black text
          doc.setFontSize(10);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(0, 0, 0);
          
          splitNotes.forEach((line: string, i: number) => {
              doc.text(line, 18, currentY + 5 + (i * 5));
          });
          
          currentY += boxHeight + 5;
      }

      const zoneTotals = calculateZoneTotals(zone);
      const tableBody: any[] = [];

      zone.sections.forEach(section => {
          const flatComponents = flattenComponents(section.components);
          if (flatComponents.length === 0) return;

          tableBody.push([{ 
              content: section.name.toUpperCase(), 
              colSpan: 4, 
              styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] } 
          }]);

          flatComponents.forEach(comp => {
              let nameContent = comp.name;
              if (comp.isTemporary) nameContent += ' (TEMP)';
              if (comp.type === 'kit') nameContent = `[KIT] ${comp.name}`;
              
              const zoneTotal = zoneTotals.get(comp.name) || 0;
              
              tableBody.push([nameContent, comp.quantity, zoneTotal, '']);
              
              if (comp.notes) {
                  tableBody.push([{
                      content: `  ↳ NOTE: ${comp.notes}`,
                      colSpan: 4,
                      styles: { fillColor: [255, 255, 204], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 9 }
                  }]);
              }
              
              comp.contents?.forEach(sub => {
                  const subZoneTotal = zoneTotals.get(sub.name) || 0;
                  tableBody.push([{ 
                      content: `  - ${sub.name}`, 
                      styles: { fontSize: 10, textColor: [80, 80, 80] } 
                  }, sub.quantity * comp.quantity, subZoneTotal, '']);
              });
          });
      });

      autoTable(doc, {
          head: [['Materiale', 'Qta', 'Totale Zona', 'Check']],
          body: tableBody,
          startY: currentY, 
          margin: { top: 25 },
          theme: 'grid',
          headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
          styles: { fontSize: 11, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
          columnStyles: { 
              0: { cellWidth: 'auto' }, 
              1: { cellWidth: 20, halign: 'center' }, 
              2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
              3: { cellWidth: 20 }
          },
          didDrawPage: (data) => {
              printHeader(zone.name, data.pageNumber);
          }
      });
  });
  
  if (activeList.notes) {
      doc.addPage();
      printHeader("Note Generali", doc.getNumberOfPages());
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Note Evento", 14, 30);
      
      const splitNotes = doc.splitTextToSize(activeList.notes, 174);
      const boxHeight = (splitNotes.length * 5) + 6;
      const notesY = 35;
      
      // Background light yellow
      doc.setFillColor(255, 255, 204);
      doc.rect(14, notesY, 182, boxHeight, 'F');
      
      // Black text
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      
      splitNotes.forEach((line: string, i: number) => {
          doc.text(line, 18, notesY + 5 + (i * 5));
      });
  }

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  doc.save(`${safeName}_${year}-${month}-${day}_${hours}-${minutes}.pdf`);
};

export const exportTotalsPDF = (activeList: PackingList) => {
  if (!activeList || !activeList.zones) return;
  
  const doc = new jsPDF();
  
  const printHeader = (zoneName: string, pageNumber: number) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      const eventName = activeList.eventName.toUpperCase();
      doc.text(eventName, 14, 12);

      const versionText = activeList.version ? `v${activeList.version}` : 'LISTA NON PRONTA';
      const titleWidth = doc.getTextWidth(eventName);
      doc.setFontSize(10);
      if (!activeList.version) doc.setTextColor(220, 0, 0);
      else doc.setTextColor(100);
      doc.text(versionText, 14 + titleWidth + 3, 12);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Pagina ${pageNumber}`, pageWidth - 14, 12, { align: 'right' });

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      doc.text("RECAP TOTALI MATERIALE", 14, 18);

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(`ZONA: ${zoneName.toUpperCase()}`, 14, 26);
  };

  const addAggregatedNote = (notesArr: { qty: number, text: string }[], qty: number, text?: string) => {
      if (!text) return;
      const existing = notesArr.find(n => n.text === text);
      if (existing) {
          existing.qty += qty;
      } else {
          notesArr.push({ qty, text });
      }
  };

  activeList.zones.forEach((zone, index) => {
      if (index > 0) doc.addPage();
      
      const complexItemsMap = new Map<string, { totalQty: number, aggregatedNotes: { qty: number, text: string }[], children: Map<string, { qty: number, prepNote: string, aggregatedNotes: { qty: number, text: string }[] }> }>();
      const simpleItemsMap = new Map<string, { totalQty: number, isTemporary: boolean, aggregatedNotes: { qty: number, text: string }[] }>();

      zone.sections.forEach(section => {
          const flatComponents = flattenComponents(section.components);
          flatComponents.forEach(comp => {
              const isComplex = comp.type === 'kit' || (comp.contents && comp.contents.length > 0);

              if (isComplex) {
                  const displayName = comp.type === 'kit' ? `KIT-${comp.name}` : comp.name;
                  
                  if (!complexItemsMap.has(displayName)) {
                      complexItemsMap.set(displayName, { totalQty: 0, aggregatedNotes: [], children: new Map() });
                  }
                  const parent = complexItemsMap.get(displayName)!;
                  parent.totalQty += comp.quantity;
                  
                  if (comp.notes) addAggregatedNote(parent.aggregatedNotes, comp.quantity, comp.notes);
                  if (comp.warehouseState?.warehouseNote) addAggregatedNote(parent.aggregatedNotes, comp.quantity, comp.warehouseState.warehouseNote);

                  comp.contents?.forEach(sub => {
                      if (!parent.children.has(sub.name)) {
                          parent.children.set(sub.name, { qty: 0, prepNote: sub.prepNote || '', aggregatedNotes: [] });
                      }
                      const child = parent.children.get(sub.name)!;
                      child.qty += (sub.quantity * comp.quantity);
                      if (sub.prepNote) child.prepNote = sub.prepNote;
                      
                      const subWs = sub.warehouseState;
                      if (sub.prepNote) addAggregatedNote(child.aggregatedNotes, sub.quantity * comp.quantity, sub.prepNote);
                      if (subWs?.warehouseNote) addAggregatedNote(child.aggregatedNotes, sub.quantity * comp.quantity, subWs.warehouseNote);
                  });

              } else {
                  if (!simpleItemsMap.has(comp.name)) {
                      simpleItemsMap.set(comp.name, { totalQty: 0, isTemporary: !!comp.isTemporary, aggregatedNotes: [] });
                  }
                  const item = simpleItemsMap.get(comp.name)!;
                  item.totalQty += comp.quantity;
                  
                  if (comp.notes) addAggregatedNote(item.aggregatedNotes, comp.quantity, comp.notes);
                  if (comp.warehouseState?.warehouseNote) addAggregatedNote(item.aggregatedNotes, comp.quantity, comp.warehouseState.warehouseNote);
              }
          });
      });

      const tableBody: any[] = [];

      const sortedComplex = Array.from(complexItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      if (sortedComplex.length > 0) {
          tableBody.push([{ 
              content: 'KIT & MACCHINE (Assemblati)', 
              colSpan: 3,
              styles: { fontStyle: 'bold', fillColor: [220, 220, 240], textColor: [0, 0, 50], halign: 'left', fontSize: 10 } 
          }]);

          sortedComplex.forEach(([displayName, data]) => {
              tableBody.push([{ 
                  content: displayName, 
                  styles: { 
                      fontStyle: 'bold',
                      textColor: [0, 0, 0],
                      fontSize: 11
                  }
              }, data.totalQty, '']);

              data.aggregatedNotes.forEach(n => {
                  tableBody.push([{
                      content: `  ↳ NOTE: x${n.qty} ${n.text}`,
                      colSpan: 3,
                      styles: { fillColor: [255, 255, 204], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 9 }
                  }]);
              });

              const sortedChildren = Array.from(data.children.entries()).sort((a, b) => a[0].localeCompare(b[0]));
              sortedChildren.forEach(([childName, childData]) => {
                  let childLabel = `  - ${childName}`;
                  if (childData.prepNote) {
                      childLabel += ` (Destinazione/Prep: ${childData.prepNote})`;
                  }

                  tableBody.push([{ 
                      content: childLabel, 
                      styles: { 
                          textColor: [80, 80, 80],
                          fontSize: 10 
                      }
                  }, childData.qty, '']);

                  childData.aggregatedNotes.forEach(n => {
                      tableBody.push([{
                          content: `    ↳ NOTE: x${n.qty} ${n.text}`,
                          colSpan: 3,
                          styles: { fillColor: [255, 255, 204], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 9 }
                      }]);
                  });
              });
          });
      }

      const sortedSimple = Array.from(simpleItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      if (sortedSimple.length > 0) {
          tableBody.push([{ 
              content: 'MATERIALE SFUSO', 
              colSpan: 3,
              styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [50, 50, 50], halign: 'left', fontSize: 10 } 
          }]);

          sortedSimple.forEach(([name, data]) => {
              let simpleLabel = data.isTemporary ? `${name} (TEMP)` : name;

              tableBody.push([{
                  content: simpleLabel,
                  styles: {
                      fontSize: 11
                  }
              }, data.totalQty, '']);

              data.aggregatedNotes.forEach(n => {
                  tableBody.push([{
                      content: `  ↳ NOTE: x${n.qty} ${n.text}`,
                      colSpan: 3,
                      styles: { fillColor: [255, 255, 204], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 9 }
                  }]);
              });
          });
      }

      autoTable(doc, {
          head: [['Materiale', 'Qta', 'Check']],
          body: tableBody,
          startY: 32,
          margin: { top: 32 },
          theme: 'grid',
          headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
          styles: { fontSize: 11, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
          columnStyles: { 
              0: { cellWidth: 'auto' }, 
              1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
              2: { cellWidth: 20 }
          },
          didDrawPage: (data) => {
              printHeader(zone.name, data.pageNumber);
          }
      });
  });

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  doc.save(`TOTALI_${safeName}_${day}-${month}-${now.getFullYear()}.pdf`);
};

export const exportCSV = (activeList: PackingList) => {
  if (!activeList || !activeList.zones) return;
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Zona,Sezione,Tipo,Nome,Quantità,Totale Zona,Note,Contenuto Kit/Accessori\n";
  
  activeList.zones.forEach(z => {
      const zoneTotals = calculateZoneTotals(z);
      
      z.sections.forEach(s => {
          s.components.forEach(c => {
              const note = c.notes ? c.notes.replace(/"/g, '""') : '';
              const typeLabel = c.type === 'kit' ? 'KIT' : 'Singolo';
              const zoneTotal = zoneTotals.get(c.name) || 0;
              const displayName = c.isTemporary ? `${c.name} (TEMP)` : c.name;
              
              csvContent += `"${z.name}","${s.name}",${typeLabel},"${displayName}",${c.quantity},${zoneTotal},"${note}",""\n`;
              
              c.contents?.forEach(sub => {
                  const subZoneTotal = zoneTotals.get(sub.name) || 0;
                  csvContent += `"${z.name}","${s.name}",${c.type === 'kit'?'Parte Kit':'Accessorio'},"${sub.name}",${sub.quantity*c.quantity},${subZoneTotal},"${note}","Appartiene a: ${c.name}"\n`;
              });
          });
      });
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  link.setAttribute("download", `${safeName}_${year}-${month}-${day}_${hours}-${minutes}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportSectionPDF = (activeList: PackingList, zoneId: string, sectionId: string) => {
  if (!activeList || !activeList.zones) return;
  
  const zone = activeList.zones.find(z => z.id === zoneId);
  if (!zone) return;
  
  const section = zone.sections.find(s => s.id === sectionId);
  if (!section) return;
  
  const doc = new jsPDF();
  
  const printHeader = (zoneName: string, sectionName: string, pageNumber: number) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      const eventName = activeList.eventName.toUpperCase();
      doc.text(eventName, 14, 12);

      const versionText = activeList.version ? `v${activeList.version}` : 'LISTA NON PRONTA';
      const titleWidth = doc.getTextWidth(eventName);
      doc.setFontSize(10);
      if (!activeList.version) doc.setTextColor(220, 0, 0);
      else doc.setTextColor(100);
      doc.text(versionText, 14 + titleWidth + 3, 12);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`${activeList.eventDate}  |  Pagina ${pageNumber}`, pageWidth - 14, 12, { align: 'right' });

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(`ZONA: ${zoneName.toUpperCase()}  |  REPARTO: ${sectionName.toUpperCase()}`, 14, 20);
  };

  let currentY = 25;
  if (zone.notes) {
      const splitNotes = doc.splitTextToSize(`NOTE ZONA: ${zone.notes}`, 174);
      const boxHeight = (splitNotes.length * 5) + 6;
      
      // Background light yellow
      doc.setFillColor(255, 255, 204);
      doc.rect(14, currentY, 182, boxHeight, 'F');
      
      // Black text
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(0, 0, 0);
      
      splitNotes.forEach((line: string, i: number) => {
          doc.text(line, 18, currentY + 5 + (i * 5));
      });
      
      currentY += boxHeight + 5;
  }

  const zoneTotals = calculateZoneTotals(zone);
  const tableBody: any[] = [];

  const flatComponents = flattenComponents(section.components);
  if (flatComponents.length > 0) {
      tableBody.push([{ 
          content: section.name.toUpperCase(), 
          colSpan: 4, 
          styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] } 
      }]);

      flatComponents.forEach(comp => {
          let nameContent = comp.name;
          if (comp.isTemporary) nameContent += ' (TEMP)';
          if (comp.type === 'kit') nameContent = `[KIT] ${comp.name}`;
          
          const zoneTotal = zoneTotals.get(comp.name) || 0;
          
          tableBody.push([nameContent, comp.quantity, zoneTotal, '']);
          
          if (comp.notes) {
              tableBody.push([{
                  content: `  ↳ NOTE: ${comp.notes}`,
                  colSpan: 4,
                  styles: { fillColor: [255, 255, 204], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 9 }
              }]);
          }
          
          comp.contents?.forEach(sub => {
              const subZoneTotal = zoneTotals.get(sub.name) || 0;
              tableBody.push([{ 
                  content: `  - ${sub.name}`, 
                  styles: { fontSize: 10, textColor: [80, 80, 80] } 
              }, sub.quantity * comp.quantity, subZoneTotal, '']);
          });
      });
  }

  autoTable(doc, {
      head: [['Materiale', 'Qta', 'Totale Zona', 'Check']],
      body: tableBody,
      startY: currentY, 
      margin: { top: 25 },
      theme: 'grid',
      headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
      styles: { fontSize: 11, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
      columnStyles: { 
          0: { cellWidth: 'auto' }, 
          1: { cellWidth: 20, halign: 'center' }, 
          2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 20 }
      },
      didDrawPage: (data) => {
          printHeader(zone.name, section.name, data.pageNumber);
      }
  });

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const safeEventName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  const safeSectionName = (section.name || 'reparto').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  doc.save(`${safeEventName}_${safeSectionName}_${year}-${month}-${day}_${hours}-${minutes}.pdf`);
};
