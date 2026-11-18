// 填入正方形头像的 HTTPS 图片地址，也支持小程序包内的 /assets/... 路径。
// 年龄段留空时使用 defaultAvatar；都为空或加载失败时显示书本占位。
module.exports = {
 defaultAvatar: 'https://img.xuninfo.top/images/defaultavatar.png', // 游客、未选择年龄段或未知年龄段
 byAge: {
  '0-2': 'https://img.xuninfo.top/images/defaultavatar.png', // 0–2 岁
  '3-4': 'https://img.xuninfo.top/images/avatartwo.png', // 3–4 岁
  '5-6': 'https://img.xuninfo.top/images/avatartwo.png'  // 5–6 岁
 }
};
