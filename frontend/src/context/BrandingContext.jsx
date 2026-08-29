import React, { createContext, useContext, useState, useEffect } from 'react';

const BrandingContext = createContext();

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) throw new Error('useBranding must be used within a BrandingProvider');
  return context;
};

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({
    schoolName: 'School ERP',
    primaryColor: '#6366f1',
    accentColor: '#10b981',
    logoUrl: '',
    faviconUrl: '',
    metaTitle: 'School ERP',
    metaDescription: 'Modern educational resource planning system.',
    isLoaded: false
  });

  const fetchBranding = async () => {
    try {
      // Check for code in URL or use host-based discovery
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const endpoint = `/api/public/branding${code ? `?code=${code}` : ''}`;
      
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        setBranding({ ...data, isLoaded: true });
        updateDocumentBranding(data);
      } else {
        setBranding(prev => ({ ...prev, isLoaded: true }));
      }
    } catch (error) {
      console.error('Failed to load branding:', error);
      setBranding(prev => ({ ...prev, isLoaded: true }));
    }
  };

  const updateDocumentBranding = (data) => {
    if (data.metaTitle) document.title = data.metaTitle;
    if (data.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = data.faviconUrl;
    }
    
    // Phase 4 Injector logic will live here as well
    const root = document.documentElement;
    if (data.primaryColor) root.style.setProperty('--primary', data.primaryColor);
    if (data.accentColor) root.style.setProperty('--accent', data.accentColor);
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, setBranding, reloadBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};
