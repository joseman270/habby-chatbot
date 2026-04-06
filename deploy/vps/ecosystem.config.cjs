module.exports = {
  apps: [
    {
      name: 'habby-chatbot',
      cwd: '/var/www/habby-chatbot',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,

        WP_URL: 'https://habita.pe',
        MAX_PROPERTIES: '20',
        WHATSAPP_NUMBER: '51999999999',

        // Perfil VPS final (hibrido real)
        LLM_PRIMARY: 'ollama',
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OLLAMA_MODEL: 'qwen2.5:7b-instruct',
        OLLAMA_ENABLE_LOCAL_MODEL_FALLBACK: 'true',
        OLLAMA_FALLBACK_MODEL: 'qwen2.5:3b-instruct',
        OLLAMA_TIMEOUT_MS: '8000',
        OLLAMA_MAX_FAILS: '3',
        OLLAMA_COOLDOWN_MS: '60000',

        // Opcion de alta calidad sin Ollama local (API con free tier)
        GEMINI_API_KEY: '',
        GEMINI_MODEL: 'gemini-1.5-flash',
        GEMINI_TIMEOUT_MS: '10000',
        LLM_ENABLE_GEMINI_FALLBACK: 'true',
        // Si no tienes Ollama 24/7, apagar fallback a Ollama para evitar latencia en failover
        LLM_ENABLE_OLLAMA_FALLBACK: 'false',

        // Para operar sin creditos externos, dejar en false.
        // Si deseas fallback cloud de emergencia, cambiar a true y completar GROQ_API_KEY.
        LLM_ENABLE_GROQ_FALLBACK: 'true',
        GROQ_API_KEY: '',
        GROQ_MODEL: 'llama-3.3-70b-versatile',
        GROQ_TIMEOUT_MS: '10000',

        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',

        SMTP_HOST: '',
        SMTP_PORT: '587',
        SMTP_USER: '',
        SMTP_PASS: '',
        SMTP_FROM: 'Habita Peru <no-reply@habita.pe>',

        CORS_ALLOW_ORIGINS: 'https://habita.pe,https://habby.pe',

        // Modo sin LLM externo (activar en true si no hay Ollama 24/7)
        CHAT_RULES_ONLY_MODE: 'false',
        // Si el LLM falla y entra safe-mode, responder por reglas automaticamente
        CHAT_ENABLE_RULES_FALLBACK: 'true',

        // Citas: por defecto desde manana y ventana de 3 dias
        SLOTS_MIN_DAYS_AHEAD: '1',
        SLOTS_DAYS_AHEAD: '3',
        SLOT_MINUTES: '30',
        APPOINTMENT_MIN_LEAD_HOURS: '12',
        WORK_START_HOUR: '9',
        WORK_END_HOUR: '18',
        WORK_DAYS: '1,2,3,4,5,6',
        LOCAL_TZ_OFFSET_MINUTES: '-300',
      },
    },
  ],
};
