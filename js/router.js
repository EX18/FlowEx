export const createRouter = (routes) => {
  const root = document.getElementById('main-content');
  const getPath = () => window.location.hash.slice(1) || '/';

  const updateActiveNav = (path) => {
    document.querySelectorAll('[data-route]').forEach((button) => {
      button.classList.toggle('active', button.dataset.route === path);
    });
  };

  const render = async () => {
    const path = getPath();
    const route = routes[path] || routes['/'];
    if (!route) return;
    updateActiveNav(path);
    root.dataset.currentRoute = path;
    root.innerHTML = '<div class="page-shell"><div class="page-loading">Cargando...</div></div>';
    await route({ root });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigate = (path) => {
    window.location.hash = path;
  };

  window.addEventListener('hashchange', render);

  return { navigate, start: render, currentPath: getPath };
};
