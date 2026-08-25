'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

type CatracaOffline = {
  id: number;
  dsCatraca: string;
  caSerial: string;
  nrSegundosSemContato: number | null;
};

type Alertas = {
  qtOffline: number;
  catracas: CatracaOffline[];
};

// Intervalo de consulta. Curto o suficiente para o aviso aparecer enquanto a
// pessoa ainda esta na tela, longo o suficiente para nao pesar: e uma consulta
// por funcionario logado.
const INTERVALO_MS = 60_000;

function tempoParado(segundos: number | null): string {
  if (segundos === null) return 'nunca comunicou';
  if (segundos < 3600) return `parada há ${Math.round(segundos / 60)}min`;
  if (segundos < 86400) return `parada há ${Math.round(segundos / 3600)}h`;
  return `parada há ${Math.round(segundos / 86400)}d`;
}

/**
 * Aviso de catraca sem comunicação, exibido no painel de funcionários e
 * gestores.
 *
 * Existe porque a falha é silenciosa: o equipamento continua liberando pela
 * última informação que recebeu e, conforme as validades expiram, começa a
 * barrar aluno em dia. Sem este aviso a academia descobre pela reclamação na
 * porta — foi o que aconteceu duas vezes durante a implantação.
 */
export function CatracaAlerta() {
  const [alertas, setAlertas] = useState<Alertas | null>(null);

  const consultar = useCallback(async () => {
    try {
      const resposta = await fetch(`${apiUrl}/controlid/alertas`);
      // Falha na consulta não vira alarme: um erro de rede momentâneo não
      // significa catraca parada, e um aviso falso ensina a ignorar o aviso.
      if (!resposta.ok) return;
      setAlertas((await resposta.json()) as Alertas);
    } catch {
      // idem: silencioso de propósito.
    }
  }, []);

  useEffect(() => {
    void consultar();
    const timer = window.setInterval(() => void consultar(), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [consultar]);

  if (!alertas || alertas.qtOffline === 0) return null;

  return (
    <div className="catraca-alerta" role="status">
      <AlertTriangle size={18} aria-hidden />
      <div>
        <strong>
          {alertas.qtOffline === 1
            ? 'Uma catraca parou de comunicar'
            : `${alertas.qtOffline} catracas pararam de comunicar`}
        </strong>
        <p>
          {alertas.catracas
            .map((catraca) => `${catraca.dsCatraca || catraca.caSerial} (${tempoParado(catraca.nrSegundosSemContato)})`)
            .join(' · ')}
        </p>
        <small>
          O controle de acesso por plano fica desatualizado enquanto isso: alunos em dia podem ser
          barrados conforme a validade expira no equipamento.
        </small>
      </div>
    </div>
  );
}
