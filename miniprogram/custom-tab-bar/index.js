Component({
 data: {
  selected: 0,
  tabs: [
   { path: 'pages/home/index', label: '发现', icon: 'discover' },
   { path: 'pages/library/index', label: '书库', icon: 'library' },
   { path: 'pages/shelf/index', label: '我的书架', icon: 'shelf' }
  ]
 },
 lifetimes: { attached() { this.sync(); } },
 pageLifetimes: { show() { this.sync(); } },
 methods: {
  sync() {
   const pages = getCurrentPages(), route = pages[pages.length - 1]?.route;
   const selected = this.data.tabs.findIndex(tab => tab.path === route);
   if (selected >= 0 && selected !== this.data.selected) this.setData({ selected });
  },
  switchTab(e) {
   const index = Number(e.currentTarget.dataset.index), tab = this.data.tabs[index];
   if (!tab || index === this.data.selected || this.switching) return;
   this.switching = true;
   wx.switchTab({
    url: '/' + tab.path,
    success: () => this.sync(),
    fail: () => { this.sync(); wx.showToast({ title: '暂时没能切换，请再试试', icon: 'none' }); },
    complete: () => { this.switching = false; }
   });
  }
 }
});
