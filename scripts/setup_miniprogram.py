#!/usr/bin/env python3
"""Create an ignored local WeChat project config; never extract or emit AppSecret."""
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def main():
    app_id = os.environ.get('WECHAT_APP_ID')
    if app_id is None:
        env = ROOT / '.env'
        if env.exists():
            # Read only the AppID assignment. Do not parse or print credential values.
            for line in env.read_text().splitlines():
                match = re.fullmatch(r"\s*(?:export\s+)?WECHAT_APP_ID\s*=\s*(['\"]?)(wx[a-zA-Z0-9]{16})\1\s*(?:#.*)?", line)
                if match:
                    app_id = match[2]
    if app_id and not re.fullmatch(r'wx[a-zA-Z0-9]{16}', app_id):
        raise SystemExit('WECHAT_APP_ID 格式无效；请检查本机配置')
    project = ROOT / 'miniprogram'
    config = json.loads((project / 'project.config.example.json').read_text())
    config['appid'] = app_id or 'touristappid'
    (project / 'project.config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    print('已生成本机小程序项目配置（真实AppID）' if app_id else '已生成游客模式小程序项目配置')

if __name__ == '__main__':
    main()
