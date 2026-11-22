package com.bodegakomatsu.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.window.OnBackInvokedDispatcher;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Demo de Bodega Komatsu: muestra la tienda empaquetada en assets/demo, con los datos
 * guardados en el teléfono. Se sirve desde un dominio https local para que funcione
 * como en el navegador (almacenamiento, cifrado, etc.).
 */
public class DemoActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/demo/index.html";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#0A0A0A"));
        getWindow().setNavigationBarColor(Color.parseColor("#0A0A0A"));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A0A0A"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost())) return false;
                // Links externos (sitios de proveedores, etc.) se abren en el navegador.
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                return true;
            }
        });
        setContentView(web);
        // Botón atrás (Android 13+ usa el sistema nuevo de "atrás predictivo").
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        // Atrás: cierra el menú o un diálogo abierto; si no hay nada, vuelve al inicio o sale.
        web.evaluateJavascript(
            "(function(){var d=document.getElementById('drawer');if(d&&!d.hidden){document.getElementById('menu-btn').click();return 'ok';}" +
            "var main=document.getElementById('main');if(main&&!document.querySelector('.hero')){var a=document.createElement('a');a.href='#/';document.body.appendChild(a);a.click();a.remove();return 'ok';}return 'exit';})()",
            value -> { if (value != null && value.contains("exit")) finish(); });
    }
}
