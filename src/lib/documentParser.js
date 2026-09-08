import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  if (file.size > 50 * 1024 * 1024) {
    throw new Error('File is too large (over 50MB). Please use a smaller file.');
  }

  switch (extension) {
    case 'pdf':
      return extractTextFromPDF(file);
    case 'docx':
    case 'doc':
      return extractTextFromDOCX(file);
    case 'pptx':
    case 'ppt':
      return extractTextFromPPTX(file);
    case 'epub':
      return extractTextFromEPUB(file);
    default:
      throw new Error(`Unsupported file type: .${extension}. Please upload a PDF, DOCX, PPTX, or EPUB file.`);
  }
}

async function extractTextFromPDF(file) {
  let arrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (e) {
    throw new Error('Could not read this PDF file. It may be corrupted or too large. Please try a different file.');
  }

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: true
    }).promise;
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('Invalid') || msg.includes('password')) {
      throw new Error('This PDF is encrypted or invalid. Please try a different file.');
    }
    throw new Error('Could not open this PDF. It may be corrupted. Please try a different file.');
  }
  
  let fullText = '';
  const totalPages = pdf.numPages;
  
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    if (items.length === 0) continue;
    
    let pageText = '';
    let lastY = null;
    let lastX = null;
    let lastWidth = null;
    
    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width || 0;
      const str = item.str || '';
      
      if (!str.trim()) continue;
      
      if (lastY !== null) {
        const yDiff = Math.abs(y - lastY);
        const xGap = lastX !== null ? x - (lastX + lastWidth) : 0;
        
        // New line: y changed significantly
        if (yDiff > 3) {
          pageText += '\n';
        }
        // Same line: add space if there's a gap
        else if (xGap > 5) {
          pageText += ' ';
        }
        // Same line, no gap — items are adjacent (e.g., word parts)
        else if (xGap > -2 && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          // Only add space if the previous char isn't already a space
          const lastChar = pageText[pageText.length - 1];
          if (lastChar !== ' ' && lastChar !== '\n') {
            pageText += ' ';
          }
        }
      }
      
      pageText += str;
      lastY = y;
      lastX = x;
      lastWidth = width;
    }
    
    // Clean up the page text
    pageText = pageText
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^\s+|\s+$/gm, '')
      .trim();
    
    if (pageText) {
      fullText += `\n--- Page ${i} of ${totalPages} ---\n${pageText}`;
    }
  }
  
  return { text: fullText.trim(), totalPages, fileName: file.name };
}

async function extractTextFromDOCX(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value.trim(), totalPages: 1, fileName: file.name };
}

async function extractTextFromPPTX(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  let fullText = '';
  let slideCount = 0;
  
  const slideFiles = [];
  zip.forEach((path, entry) => {
    if (path.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      slideFiles.push({ path, entry });
    }
  });
  
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.path.match(/slide(\d+)/)?.[1] || '0');
    const numB = parseInt(b.path.match(/slide(\d+)/)?.[1] || '0');
    return numA - numB;
  });
  
  for (const { entry } of slideFiles) {
    slideCount++;
    const xml = await entry.async('text');
    
    const texts = [];
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const text = match[1]
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) texts.push(text);
    }
    
    const slideText = texts.join(' ');
    if (slideText.trim()) {
      fullText += `\n--- Slide ${slideCount} ---\n${slideText}`;
    }
  }
  
  if (!fullText.trim()) {
    throw new Error('No readable text found in the PowerPoint file. It may contain only images or shapes.');
  }
  
  return { text: fullText.trim(), totalPages: slideCount, fileName: file.name };
}

async function extractTextFromEPUB(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  let fullText = '';
  let chapterCount = 0;
  
  const htmlFiles = [];
  zip.forEach((path, entry) => {
    if (path.match(/\.(xhtml|html|htm)$/i) && !path.includes('__MACOSX')) {
      htmlFiles.push({ path, entry });
    }
  });
  
  let orderedFiles = htmlFiles;
  
  let opfPath = null;
  zip.forEach((path) => {
    if (path.match(/content\.opf$/i)) opfPath = path;
  });
  
  if (opfPath) {
    const opfXml = await zip.file(opfPath).async('text');
    const spineIds = [];
    const spineRegex = /<itemref\s+idref="([^"]+)"/g;
    let spineMatch;
    while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
      spineIds.push(spineMatch[1]);
    }
    
    const manifestItems = {};
    const manifestRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"/g;
    let manifestMatch;
    while ((manifestMatch = manifestRegex.exec(opfXml)) !== null) {
      manifestItems[manifestMatch[1]] = manifestMatch[2];
    }
    
    if (spineIds.length > 0) {
      const basePath = opfPath.replace(/\/[^/]+$/, '/');
      orderedFiles = spineIds
        .map(id => {
          const href = manifestItems[id];
          if (!href) return null;
          const fullPath = basePath + href;
          const found = htmlFiles.find(f => f.path === fullPath || f.path.endsWith(href));
          return found;
        })
        .filter(Boolean);
    }
  }
  
  for (const { entry } of orderedFiles) {
    chapterCount++;
    const html = await entry.async('text');
    
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^\s+|\s+$/gm, '')
      .trim();
    
    if (text.length > 20) {
      fullText += `\n--- Chapter ${chapterCount} ---\n${text}`;
    }
  }
  
  if (!fullText.trim()) {
    throw new Error('No readable text found in the EPUB file.');
  }
  
  return { text: fullText.trim(), totalPages: chapterCount, fileName: file.name };
}
