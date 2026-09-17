#!/bin/sh
# Maakt van NLW_KERN een volledige DNS-naam en meldt wat deze pod aan Services ziet.
#
# De resolver van nginx gebruikt de zoekdomeinen uit resolv.conf niet, dus `nlw-nlw` vindt hij
# niet terwijl `nlw-nlw.<namespace>.svc.cluster.local` wel werkt. Staat er geen punt in de
# hostnaam van NLW_KERN, dan komt het eerste zoekdomein erachter. Het script draait vóór
# 20-envsubst-on-templates.sh, dat NLW_KERN in de nginx-configuratie zet.
#
# De *_SERVICE_HOST-variabelen (één per Service in de namespace) staan erbij omdat het platform
# de interne namen niet documenteert: op ZAD heet een Service <deployment>-<component>.
host="${NLW_KERN%%:*}"
poort="${NLW_KERN#*:}"
case "${host}" in
	*.*) ;;
	*)
		zoekdomein="$(awk '/^search/ { print $2; exit }' /etc/resolv.conf)"
		if [ -n "${zoekdomein}" ]; then
			export NLW_KERN="${host}.${zoekdomein}:${poort}"
		fi
		;;
esac
echo "nlw-proxy: NLW_KERN=${NLW_KERN}"
echo "nlw-proxy: services in deze namespace:"
env | grep -E '_SERVICE_HOST=' | sort | sed 's/^/  /'
