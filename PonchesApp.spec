# -*- mode: python ; coding: utf-8 -*-
import os
import sys

# Insertar 'backend' al inicio de sys.path ANTES de llamar a collect_all
sys.path.insert(0, os.path.abspath('backend'))

from PyInstaller.utils.hooks import collect_all

datas = [
    ('frontend/dist', 'frontend/dist'),
    ('backend/data', 'backend/data'),
    ('backend/app', 'app')  # Copia directa de la estructura física del código
]
binaries = []
hiddenimports = []

tmp_ret = collect_all('app')
datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

a = Analysis(
    ['backend/desktop.py'],
    pathex=['backend'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PonchesApp',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PonchesApp',
)