Component({ properties: { book: Object }, methods: { open() { wx.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(this.data.book.id) }); } } });
