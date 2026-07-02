# Wang,yuya&zhennan

这是一个送给女朋友的星空礼物网页原型。

当前版本不依赖背景插画或照片。夜空、地平线、草坡、女孩剪影和 661 颗可点击星星都由 `index.html`、`styles.css` 和 `script.js` 分层生成。

## 怎么打开

直接打开 `index.html` 就可以预览。

## 怎么改在一起的起始日期

在 `script.js` 顶部改这一行：

```js
relationshipStartDate: "2024-09-09",
```

现在这个日期会让 2026-07-01 显示为第 661 天。

## 怎么填写星星内容

只改 `data/stars.js`：

```js
{
  day: 1,
  title: "这里写标题",
  message: "这里写想对她说的话。",
  type: "memory"
}
```

`type` 可选：

- `normal`：普通星星
- `memory`：特别回忆
- `anniversary`：纪念日
- `letter`：长信或重要告白
- `future`：写给未来

没有填写内容的星星会自动显示默认占位文案。
