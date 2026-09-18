'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Search } from 'lucide-react';
import { formatCep } from './registrationHelpers';
import { apiFetch as fetch, apiUrl } from '../api/apiFetch';

// Leaflet breaks under SSR, so the map is imported on the client only.
const LocationPickerMap = dynamic(
  () => import('../../features/localities/LocationPickerMap').then((mod) => mod.LocationPickerMap),
  { ssr: false },
);

const DEFAULT_LATITUDE = -14.235;
const DEFAULT_LONGITUDE = -51.9253;

// Resposta de /localities/cep/:cep. A API já normaliza os nomes do ViaCEP
// (`localidade` -> cidade, `uf` -> estado) e converte "CEP inexistente" —
// que o ViaCEP devolve como 200 com `erro` no corpo — em 404.
type CepLookupResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

export type AddressLocationValue = {
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  latitude: string;
  longitude: string;
  hasPickedLocation: boolean;
};

export const emptyAddressLocation: AddressLocationValue = {
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  latitude: '',
  longitude: '',
  hasPickedLocation: false,
};

type AddressLocationPickerProps = {
  value: AddressLocationValue;
  onChange: (next: AddressLocationValue) => void;
  disabled?: boolean;
  /** Backend endpoint that geocodes a Brazilian address into lat/lon. */
  geocodeEndpoint?: string;
};

export function AddressLocationPicker({
  value,
  onChange,
  disabled = false,
  geocodeEndpoint = 'localities/geocode',
}: AddressLocationPickerProps) {
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressFeedback, setAddressFeedback] = useState('');

  const patch = (partial: Partial<AddressLocationValue>) => onChange({ ...value, ...partial });

  async function handleLookupCep() {
    const digits = value.cep.replace(/\D/g, '');

    if (digits.length !== 8) {
      setAddressFeedback('Informe um CEP válido.');
      return;
    }

    try {
      setIsLookingUpCep(true);
      setAddressFeedback('');

      // A consulta ao ViaCEP acontece na API, nao aqui. Chamar o serviço direto
      // do navegador esbarra na CSP desta aplicação (`connect-src 'self'`), que
      // só permite falar com o proxy same-origin — e o console reporta isso
      // como falha de rede/CORS, apontando para o lado errado do problema.
      const response = await fetch(`${apiUrl}/localities/cep/${digits}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404 ? 'CEP não encontrado.' : 'Não foi possível consultar o CEP.',
        );
      }

      const data = (await response.json()) as CepLookupResponse;

      patch({
        logradouro: data.logradouro ?? '',
        bairro: data.bairro ?? '',
        cidade: data.cidade ?? '',
        estado: data.estado ?? '',
      });
      setAddressFeedback('Endereço preenchido a partir do CEP.');
    } catch (error) {
      setAddressFeedback(error instanceof Error ? error.message : 'Erro ao consultar o CEP.');
    } finally {
      setIsLookingUpCep(false);
    }
  }

  async function handleGeocodeAddress() {
    if (!value.cep && !value.logradouro) {
      setAddressFeedback('Informe o CEP ou o logradouro para buscar as coordenadas.');
      return;
    }

    try {
      setIsGeocoding(true);
      setAddressFeedback('');

      const response = await fetch(`${apiUrl}/${geocodeEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cep: value.cep,
          logradouro: value.logradouro,
          numero: value.numero,
          bairro: value.bairro,
          cidade: value.cidade,
          estado: value.estado,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível localizar o endereço.');
      }

      const data = (await response.json()) as { latitude: number; longitude: number };
      patch({
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        hasPickedLocation: true,
      });
      setAddressFeedback('Coordenadas encontradas. Confirme o ponto no mapa.');
    } catch (error) {
      setAddressFeedback(error instanceof Error ? error.message : 'Erro ao buscar coordenadas.');
    } finally {
      setIsGeocoding(false);
    }
  }

  function handleMapPositionChange(nextLatitude: number, nextLongitude: number) {
    patch({
      latitude: String(nextLatitude),
      longitude: String(nextLongitude),
      hasPickedLocation: true,
    });
  }

  return (
    <section aria-label="Buscar localização" className="exercise-files-section" style={{ flex: '1 1 100%' }}>
      <div className="exercise-files-header">
        <p className="section-label">Localização</p>
      </div>

      {addressFeedback ? <div className="form-feedback">{addressFeedback}</div> : null}

      <div className="drawer-fields">
        <div className="field field-size-sm">
          <label htmlFor="addressCep">CEP</label>
          <input inputMode="numeric"
            disabled={disabled}
            id="addressCep"
            maxLength={9}
            onBlur={() => void handleLookupCep()}
            onChange={(e) => patch({ cep: formatCep(e.target.value) })}
            placeholder="00000-000"
            type="text"
            value={value.cep}
          />
        </div>
        <div className="field field-size-md">
          <label htmlFor="addressLogradouro">Logradouro</label>
          <input
            disabled={disabled}
            id="addressLogradouro"
            maxLength={150}
            onChange={(e) => patch({ logradouro: e.target.value })}
            placeholder="Rua, avenida..."
            type="text"
            value={value.logradouro}
          />
        </div>
        <div className="field field-size-xs">
          <label htmlFor="addressNumero">Número</label>
          <input
            disabled={disabled}
            id="addressNumero"
            maxLength={10}
            onChange={(e) => patch({ numero: e.target.value })}
            placeholder="0"
            type="text"
            value={value.numero}
          />
        </div>
        <div className="field field-size-sm">
          <label htmlFor="addressBairro">Bairro</label>
          <input
            disabled={disabled}
            id="addressBairro"
            maxLength={100}
            onChange={(e) => patch({ bairro: e.target.value })}
            placeholder="Bairro"
            type="text"
            value={value.bairro}
          />
        </div>
        <div className="field field-size-sm">
          <label htmlFor="addressCidade">Cidade</label>
          <input
            disabled={disabled}
            id="addressCidade"
            maxLength={100}
            onChange={(e) => patch({ cidade: e.target.value })}
            placeholder="Cidade"
            type="text"
            value={value.cidade}
          />
        </div>
        <div className="field field-size-xs">
          <label htmlFor="addressEstado">UF</label>
          <input
            disabled={disabled}
            id="addressEstado"
            maxLength={2}
            // UF aceitava digito ("9Z" chegava a ser gravado). So letras.
            onChange={(e) => patch({ estado: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
            placeholder="SP"
            type="text"
            value={value.estado}
          />
        </div>
        <div className="form-actions" style={{ flex: '1 1 100%' }}>
          <button
            className="secondary-button"
            disabled={disabled || isLookingUpCep}
            onClick={() => void handleLookupCep()}
            type="button"
          >
            <Search size={16} />
            {isLookingUpCep ? 'Buscando CEP...' : 'Buscar CEP'}
          </button>
          <button
            disabled={disabled || isGeocoding}
            onClick={() => void handleGeocodeAddress()}
            type="button"
          >
            <MapPin size={16} />
            {isGeocoding ? 'Localizando...' : 'Buscar coordenadas'}
          </button>
        </div>
      </div>

      <p className="form-hint">
        {value.hasPickedLocation
          ? 'Arraste o pino no mapa para ajustar a posição exata, se necessário.'
          : 'Busque as coordenadas para visualizar e confirmar o local no mapa.'}
      </p>

      <LocationPickerMap
        latitude={value.hasPickedLocation ? Number(value.latitude) : DEFAULT_LATITUDE}
        longitude={value.hasPickedLocation ? Number(value.longitude) : DEFAULT_LONGITUDE}
        onChange={handleMapPositionChange}
        zoom={value.hasPickedLocation ? 16 : 4}
      />
    </section>
  );
}
